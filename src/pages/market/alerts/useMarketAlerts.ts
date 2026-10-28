/**
 * Market Watch / saved-search alerts: keeps the saved searches synced with pd2trader.com for the signed-in PD2
 * token, and while any of them alerts (and alerts are on) listens on the server's live alert stream. Each new
 * match is recorded immediately. The first pops a toast; subsequent matches are summarized at 30-second
 * intervals while new matches arrive. Mounted once, in AppController.
 *
 * The server matches every listing PD2 adds or bumps (about every 15 s) and keeps alerts for 30 days: after a
 * reconnect, missed ones are caught up on. A 401 stops the stream until the token changes.
 */
import { useEffect, useRef, useState } from 'react';
import { useOptions } from '@/hooks/useOptions';
import { playNotificationSound } from '@/hooks/useSocketNotifications';
import { showToast } from '@/overlay';
import { syncSavedSearches, useMarketStore } from '@/pages/market/store/useMarketStore';
import { publishMarketAlerts } from './alert-events';
import { alertToasts } from './alert-logic';
import { rememberLiveAlerts, unexpiredAlerts } from './alert-history';
import { runAlertStream } from './alert-stream';
import { listMarketAlerts, type MarketAlert, openAlertStream } from './saved-search-api';

export const ALERT_POPUP_INTERVAL_MS = 30_000;

export function useMarketAlerts(): void {
  const { settings, isLoading } = useOptions();
  const token = isLoading ? undefined : settings.pd2Token;
  const { savedSearches, alertsEnabled } = useMarketStore();

  useEffect(() => {
    rememberLiveAlerts(token, []);
    syncSavedSearches(token ?? null);
  }, [token]);

  const watching = alertsEnabled && savedSearches.some((s) => s.alert);
  /** The token the stream got a 401 with: no reconnecting until a new one. */
  const [refusedToken, setRefusedToken] = useState<string | null>(null);
  const active = !!token && watching && token !== refusedToken;

  const sound = useRef({ enabled: true, volume: 70 });
  useEffect(() => {
    sound.current = { enabled: settings.marketAlertSoundEnabled ?? true, volume: settings.marketAlertVolume ?? 70 };
  });
  /** Alert ids shown this session: a stream restart (e.g. alerts toggled) never shows one twice. */
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!active || !token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: MarketAlert[] = [];
    const showPending = () => {
      timer = undefined;
      const fresh = unexpiredAlerts(pending);
      pending = [];
      if (!fresh.length) return;
      alertToasts(fresh).forEach((toast) => showToast(toast));
      if (sound.current.enabled) playNotificationSound(sound.current.volume);
      timer = setTimeout(showPending, ALERT_POPUP_INTERVAL_MS);
    };
    const onAlerts = (alerts: MarketAlert[]) => {
      alerts = unexpiredAlerts(alerts);
      if (!alerts.length) return;
      rememberLiveAlerts(token, alerts);
      pending.push(...alerts);
      if (!timer) showPending();
      // The open market panel lights up matching cards of the watched search on screen
      publishMarketAlerts(alerts);
    };
    void runAlertStream({
      token,
      open: openAlertStream,
      catchUp: async (t, since) => (await listMarketAlerts(t, since)).items,
      onAlerts,
      onUnauthorized: () => setRefusedToken(token),
      signal: controller.signal,
      seen: seen.current,
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, token]);
}
