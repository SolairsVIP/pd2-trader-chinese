/**
 * Market Watch / saved-search alerts: keeps the saved searches synced with pd2trader.com for the signed-in PD2
 * token, and while any of them alerts (and alerts are on) listens on the server's live alert stream. Each new
 * match is recorded immediately. Popups are either per match or summarized at 30-second intervals.
 * Mounted once, in AppController.
 *
 * The server matches every listing PD2 adds or bumps (about every 15 s) and keeps alerts for 30 days: after a
 * reconnect, missed ones are caught up on. A 401 stops the stream until the token changes.
 */
import { useEffect, useRef, useState } from 'react';
import { useOptions } from '@/hooks/useOptions';
import { playNotificationSound } from '@/hooks/useSocketNotifications';
import { showToast, useOverlay } from '@/overlay';
import { dismissMarketAlertSummary, showMarketAlertToast } from '@/overlay/toast';
import { syncSavedSearches, useMarketStore } from '@/pages/market/store/useMarketStore';
import { publishMarketAlerts } from './alert-events';
import { alertToasts, MAX_ALERT_TOASTS } from './alert-logic';
import { ALERT_RETENTION_MS, rememberLiveAlerts, subscribeAlertHistoryCleared, unexpiredAlerts } from './alert-history';
import { runAlertStream } from './alert-stream';
import { listMarketAlerts, type MarketAlert, openAlertStream } from './saved-search-api';

export const ALERT_POPUP_INTERVAL_MS = 30_000;
// Realtime toast descriptions are clamped to two lines and the toast to 96px, with a 10px gap.
const ALERT_TOAST_HEIGHT = 96;
const ALERT_TOAST_GAP = 10;
const ALERT_TOAST_MARGIN = 16;
let summarySequence = 0;
type QueuedAlert = { alert: MarketAlert; sounded: boolean };

export function useMarketAlerts(): void {
  const { settings, isLoading } = useOptions();
  const { gameRect, gameFocused } = useOverlay();
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const availableHeight = gameFocused
    ? Math.max(0, Math.min(viewportHeight, gameRect.y + gameRect.height) - Math.max(0, gameRect.y))
    : viewportHeight;
  const capacity = Math.max(1, Math.min(MAX_ALERT_TOASTS,
    Math.floor((availableHeight - 2 * ALERT_TOAST_MARGIN + ALERT_TOAST_GAP) / (ALERT_TOAST_HEIGHT + ALERT_TOAST_GAP))));
  const token = isLoading ? undefined : settings.pd2Token;
  const { savedSearches, alertsEnabled } = useMarketStore();

  const watching = alertsEnabled && savedSearches.some((s) => s.alert);
  /** The token the stream got a 401 with: no reconnecting until a new one. */
  const [refusedToken, setRefusedToken] = useState<string | null>(null);
  const active = !!token && watching && token !== refusedToken;

  const sound = useRef({ enabled: true, volume: 70 });
  const realtime = useRef(settings.marketAlertRealtime === true);
  const modeChanged = useRef<(() => void) | null>(null);
  const capacityRef = useRef(capacity);
  const capacityChanged = useRef<(() => void) | null>(null);
  useEffect(() => {
    capacityRef.current = capacity;
    capacityChanged.current?.();
  }, [capacity]);
  useEffect(() => {
    realtime.current = settings.marketAlertRealtime === true;
    modeChanged.current?.();
  }, [settings.marketAlertRealtime]);
  useEffect(() => {
    sound.current = { enabled: settings.marketAlertSoundEnabled ?? true, volume: settings.marketAlertVolume ?? 70 };
  });
  /** Alert ids shown this session: a stream restart (e.g. alerts toggled) never shows one twice. */
  const seen = useRef(new Map<string, Set<string>>());
  /** Prevent an in-flight catch-up from resurrecting history cleared during this session. */
  const clearedAt = useRef(new Map<string, number>());
  /** Clearing or switching popup mode must not reset the 30-second summary limit. */
  const nextSummaryAt = useRef(new Map<string, number>());
  /** Pause waiting items when listening temporarily stops; never carry them to another account. */
  const suspended = useRef<{ token: string; pending: QueuedAlert[]; realtime: QueuedAlert[] } | null>(null);
  const clearActive = useRef<((token: string) => void) | null>(null);
  useEffect(() => {
    if (suspended.current?.token !== token) suspended.current = null;
    rememberLiveAlerts(token, []);
    syncSavedSearches(token ?? null);
  }, [token]);
  useEffect(() => subscribeAlertHistoryCleared((clearedToken) => {
    clearedAt.current.set(clearedToken, Date.now());
    if (suspended.current?.token === clearedToken) suspended.current = null;
    clearActive.current?.(clearedToken);
  }), []);

  useEffect(() => {
    if (!active || !token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let summaryExpiry: ReturnType<typeof setTimeout> | undefined;
    let summaryId = `market-alert-summary-${++summarySequence}`;
    let summaryShown = false;
    const restored = suspended.current?.token === token ? suspended.current : null;
    suspended.current = null;
    let pending: QueuedAlert[] = realtime.current ? [] : [...(restored?.pending ?? []), ...(restored?.realtime ?? [])];
    let realtimeQueue: QueuedAlert[] = realtime.current ? [...(restored?.pending ?? []), ...(restored?.realtime ?? [])] : [];
    let stopped = false;
    const displaying = new Map<string, {
      alert: MarketAlert; cancel: () => void; expiry?: ReturnType<typeof setTimeout>;
    }>();
    const dismissSummary = () => {
      clearTimeout(summaryExpiry);
      summaryExpiry = undefined;
      if (summaryShown) dismissMarketAlertSummary(summaryId);
      summaryShown = false;
      // A canceled toast can still be animating out when the next one is created.
      summaryId = `market-alert-summary-${++summarySequence}`;
    };
    const dismissAllRealtime = () => {
      const activeToasts = [...displaying.values()];
      displaying.clear();
      activeToasts.forEach((entry) => { clearTimeout(entry.expiry); entry.cancel(); });
    };

    const pumpRealtime = () => {
      while (!stopped && realtime.current && displaying.size < capacityRef.current && realtimeQueue.length) {
        const { alert, sounded } = realtimeQueue.shift()!;
        // A backlog may outlive the normal 30-minute alert retention window.
        if (!unexpiredAlerts([alert]).length) continue;
        const payload = alertToasts([alert])[0];
        if (!payload) continue;
        const entry: { alert: MarketAlert; cancel: () => void; expiry?: ReturnType<typeof setTimeout> } =
          { alert, cancel: () => {} };
        displaying.set(alert.id, entry);
        entry.cancel = showMarketAlertToast({ ...payload, id: `market-alert-${alert.id}` }, () => {
          if (displaying.get(alert.id) !== entry) return;
          displaying.delete(alert.id);
          clearTimeout(entry.expiry);
          pumpRealtime();
        });
        entry.expiry = setTimeout(() => {
          if (displaying.get(alert.id) !== entry) return;
          displaying.delete(alert.id);
          entry.cancel();
          pumpRealtime();
        }, Math.max(0, Date.parse(alert.matchedAt) + ALERT_RETENTION_MS - Date.now()));
        if (!sounded && sound.current.enabled) playNotificationSound(sound.current.volume);
      }
    };
    const reconcileCapacity = () => {
      const excess = [...displaying.values()].slice(0, Math.max(0, displaying.size - capacityRef.current));
      const deferred: QueuedAlert[] = [];
      for (const entry of excess) {
        displaying.delete(entry.alert.id);
        clearTimeout(entry.expiry);
        entry.cancel();
        deferred.push({ alert: entry.alert, sounded: true });
      }
      if (realtime.current) {
        realtimeQueue.unshift(...deferred);
        pumpRealtime();
      } else {
        pending.unshift(...deferred);
        if (pending.length && !timer) showPending();
      }
    };
    capacityChanged.current = reconcileCapacity;
    const showPending = () => {
      timer = undefined;
      pending = pending.filter(({ alert }) => unexpiredAlerts([alert]).length > 0);
      if (!pending.length) return;
      const delay = (nextSummaryAt.current.get(token) ?? 0) - Date.now();
      if (delay > 0) {
        timer = setTimeout(showPending, delay);
        return;
      }
      const fresh = pending;
      pending = [];
      alertToasts(fresh.map(({ alert }) => alert)).forEach((toast) => showToast({ ...toast, id: summaryId }));
      summaryShown = true;
      nextSummaryAt.current.set(token, Date.now() + ALERT_POPUP_INTERVAL_MS);
      clearTimeout(summaryExpiry);
      const newestExpiry = fresh.reduce((latest, { alert }) => Math.max(latest, Date.parse(alert.matchedAt) + ALERT_RETENTION_MS), 0);
      summaryExpiry = setTimeout(dismissSummary, Math.max(0, newestExpiry - Date.now()));
      if (fresh.some(({ sounded }) => !sounded) && sound.current.enabled) playNotificationSound(sound.current.volume);
    };
    modeChanged.current = () => {
      if (realtime.current) {
        clearTimeout(timer);
        timer = undefined;
        realtimeQueue.push(...pending);
        pending = [];
        pumpRealtime();
      } else {
        // Already visible alerts finish while the mode is off.
        pending.push(...realtimeQueue);
        realtimeQueue = [];
        if (pending.length && !timer) showPending();
      }
    };
    clearActive.current = (clearedToken) => {
      if (clearedToken !== token) return;
      pending = [];
      realtimeQueue = [];
      dismissAllRealtime();
      dismissSummary();
      clearTimeout(timer);
      timer = undefined;
    };
    const onAlerts = (alerts: MarketAlert[]) => {
      if (stopped) return;
      alerts = unexpiredAlerts(alerts).filter((alert) => Date.parse(alert.matchedAt) > (clearedAt.current.get(token) ?? 0));
      if (!alerts.length) return;
      rememberLiveAlerts(token, alerts);
      if (realtime.current) {
        realtimeQueue.push(...alerts.map((alert) => ({ alert, sounded: false })));
        pumpRealtime();
      }
      else {
        pending.push(...alerts.map((alert) => ({ alert, sounded: false })));
        if (!timer) showPending();
      }
      // The open market panel lights up matching cards of the watched search on screen
      publishMarketAlerts(alerts);
    };
    const tokenSeen = seen.current.get(token) ?? new Set<string>();
    seen.current.set(token, tokenSeen);
    void runAlertStream({
      token,
      open: openAlertStream,
      catchUp: async (t, since) => (await listMarketAlerts(t, since)).items,
      onAlerts,
      onUnauthorized: () => setRefusedToken(token),
      signal: controller.signal,
      seen: tokenSeen,
    });
    if (realtime.current) pumpRealtime();
    else if (pending.length) showPending();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      const interrupted = [...displaying.values()].map(({ alert }) => ({ alert, sounded: true }));
      suspended.current = {
        token,
        pending: realtime.current ? pending : [...interrupted, ...pending],
        realtime: realtime.current ? [...interrupted, ...realtimeQueue] : realtimeQueue,
      };
      realtimeQueue = [];
      pending = [];
      dismissAllRealtime();
      dismissSummary();
      modeChanged.current = null;
      capacityChanged.current = null;
      clearActive.current = null;
    };
  }, [active, token]);
}
