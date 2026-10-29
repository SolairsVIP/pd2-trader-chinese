import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useOptions } from '@/hooks/useOptions';
import { alertListingText } from './alert-logic';
import { subscribeMarketAlerts } from './alert-events';
import { ALERT_RETENTION_MS, clearLiveAlerts, liveAlertHistory, mergeAlertHistory, unexpiredAlerts } from './alert-history';
import { listMarketAlerts, type MarketAlert } from './saved-search-api';

const temporaryClearTimes = new Map<string, number>();
function clearTime(token?: string, accountId?: string): number {
  if (!token) return 0;
  if (!accountId) return temporaryClearTimes.get(token) ?? 0;
  try { return Math.max(Number(localStorage.getItem(`market-alert-cleared:${accountId}`)) || 0, temporaryClearTimes.get(token) ?? 0); } catch { return temporaryClearTimes.get(token) ?? 0; }
}
function clearHistory(token?: string, accountId?: string): void {
  if (!token) return;
  const now = Date.now();
  temporaryClearTimes.set(token, now);
  if (accountId) { try { localStorage.setItem(`market-alert-cleared:${accountId}`, String(now)); } catch { /* memory fallback */ } }
}
function visibleAlerts(alerts: readonly MarketAlert[], token?: string, accountId?: string): MarketAlert[] {
  const cutoff = clearTime(token, accountId);
  return unexpiredAlerts(alerts).filter((alert) => Date.parse(alert.matchedAt) > cutoff);
}

export function AlertHistory({ token, accountId, onView }: { token?: string; accountId?: string; onView: (alert: MarketAlert) => void; visible?: boolean }) {
  const { settings, updateSettings } = useOptions();
  const [items, setItems] = useState<MarketAlert[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  useEffect(() => { setItems(visibleAlerts(liveAlertHistory(token), token, accountId)); }, [token, accountId]);
  useEffect(() => subscribeMarketAlerts((alerts) => setItems((current) => visibleAlerts(mergeAlertHistory(current, alerts), token, accountId))), [token, accountId]);
  useEffect(() => {
    if (!token) { setStatus('ready'); return; }
    let cancelled = false;
    setStatus('loading');
    listMarketAlerts(token, new Date(Date.now() - ALERT_RETENTION_MS).toISOString()).then(({ items: history }) => {
      if (!cancelled) { setItems((current) => visibleAlerts(mergeAlertHistory(current, history), token, accountId)); setStatus('ready'); }
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [token, accountId, revision]);
  useEffect(() => {
    if (!items.length) return;
    const next = Math.min(...items.map((item) => Date.parse(item.matchedAt) + ALERT_RETENTION_MS));
    const timer = setTimeout(() => setItems((current) => unexpiredAlerts(current)), Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [items]);
  return <section aria-label="市场提醒记录" className="min-h-0 flex-1 overflow-y-auto p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">市场提醒记录 <span className="font-normal text-muted-foreground">（保留 30 分钟）</span></h2>
      <div className="flex items-center gap-1"><Button size="sm" variant="ghost" disabled={!token} onClick={() => { clearHistory(token, accountId); clearLiveAlerts(token); setItems([]); }}>全部清除</Button><Button size="sm" variant="ghost" onClick={() => setRevision((v) => v + 1)}>刷新</Button></div></div>
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-3">
      <div><label htmlFor="market-alert-realtime" className="text-sm font-medium">实时弹出全部市场提醒</label>
        <p className="mt-1 text-xs text-muted-foreground">开启后每条新匹配都会弹窗，数量较多时排队显示（30 分钟内有效）；关闭时未展示的提醒合并汇总，之后每 30 秒最多弹窗一次。</p></div>
      <Switch id="market-alert-realtime" checked={settings.marketAlertRealtime === true} onCheckedChange={(checked) => updateSettings({ marketAlertRealtime: checked })} />
    </div>
    {!token ? <p className="text-sm text-muted-foreground">登录后可查看提醒记录。</p> : null}
    {status === 'loading' && <p className="text-sm text-muted-foreground">正在加载提醒记录…</p>}
    {status === 'error' && <p className="text-sm text-destructive">无法加载服务端提醒记录，请稍后刷新。当前显示的实时提醒仍可查看。</p>}
    {token && status === 'ready' && !items.length && <p className="text-sm text-muted-foreground">暂无提醒记录。</p>}
    <div className="space-y-2">{items.map((alert) => <button key={alert.id} type="button" onClick={() => onView(alert)}
      className="w-full rounded-lg border border-border bg-background p-3 text-left hover:bg-accent">
      <div className="flex justify-between gap-3"><span className="font-medium">{alertListingText(alert)}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(alert.matchedAt).toLocaleString()}</span></div>
      <div className="mt-1 text-xs text-muted-foreground">{alert.savedSearchName} · {alert.listing?.seller ?? '卖家未知'}</div>
    </button>)}</div>
  </section>;
}
