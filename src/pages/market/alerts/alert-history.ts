import type { MarketAlert } from './saved-search-api';

/** Preserve live events received while a history request is in flight. */
export function mergeAlertHistory(current: readonly MarketAlert[], incoming: readonly MarketAlert[]): MarketAlert[] {
  const byId = new Map([...current, ...incoming].map((alert) => [alert.id, alert]));
  return [...byId.values()].sort((a, b) => Date.parse(b.matchedAt) - Date.parse(a.matchedAt));
}

export const ALERT_RETENTION_MS = 30 * 60 * 1000;
export function unexpiredAlerts(alerts: readonly MarketAlert[], now = Date.now()): MarketAlert[] {
  return alerts.filter((alert) => Number.isFinite(Date.parse(alert.matchedAt)) && Date.parse(alert.matchedAt) > now - ALERT_RETENTION_MS);
}

let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (!live.length) return;
  const next = Math.min(...live.map((a) => Date.parse(a.matchedAt) + ALERT_RETENTION_MS));
  expiryTimer = setTimeout(() => { live = unexpiredAlerts(live); scheduleExpiry(); }, Math.max(0, next - Date.now()));
}
let owner: string | undefined;
let live: MarketAlert[] = [];
const clearListeners = new Set<(token: string) => void>();
export function rememberLiveAlerts(token: string | undefined, alerts: readonly MarketAlert[]): void {
  if (owner !== token) { owner = token; live = []; }
  if (token) live = unexpiredAlerts(mergeAlertHistory(live, alerts)).slice(0, 500);
  scheduleExpiry();
}
export function clearLiveAlerts(token: string | undefined): void {
  if (token && owner === token) { live = []; scheduleExpiry(); }
  if (token) clearListeners.forEach((listener) => listener(token));
}
/** Notify the live-popup queue when the user clears this account's history. */
export function subscribeAlertHistoryCleared(listener: (token: string) => void): () => void {
  clearListeners.add(listener);
  return () => { clearListeners.delete(listener); };
}
export function liveAlertHistory(token: string | undefined): MarketAlert[] {
  return token && owner === token ? unexpiredAlerts(live) : [];
}
