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
export function rememberLiveAlerts(token: string | undefined, alerts: readonly MarketAlert[]): void {
  if (owner !== token) { owner = token; live = []; closeAlertHistory(); }
  if (token) live = unexpiredAlerts(mergeAlertHistory(live, alerts)).slice(0, 500);
  scheduleExpiry();
}
export function clearLiveAlerts(token: string | undefined): void {
  if (token && owner === token) { live = []; scheduleExpiry(); }
}
export function liveAlertHistory(token: string | undefined): MarketAlert[] {
  return token && owner === token ? unexpiredAlerts(live) : [];
}

let popupShown = false;
export function claimAlertPopup(): boolean {
  if (popupShown) return false;
  popupShown = true;
  return true;
}
export function closeAlertHistory(): void { popupShown = false; }
