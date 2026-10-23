import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { Bell, BellOff, Bookmark, Check, Pencil, Play, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showToast, undoToast } from '@/overlay';
import { EmptyState } from '@/pages/currency/components/StatePanel';
import { type MarketStore, retrySavedSearchSync } from '@/pages/market/store/useMarketStore';
import { ITEM_TYPES } from '../lib/catalog';
import { filterName } from './stat-text';
import type { MarketFilters, SavedSearch, StatFilter } from '../lib/types';
import { fieldInputClass } from './controls';
import { localizeQuality } from '@/lib/localize-pd2-text';

const UNDO_MS = 6000;

/** One-line description of a search: item, type, rarity, stats, mode. */
export function describeFilters(f: MarketFilters): string {
  const parts: string[] = [];
  if (f.itemName) parts.push(f.itemName);
  if (f.typeCode) parts.push(ITEM_TYPES.find((t) => t.code === f.typeCode)?.label ?? '类型');
  if (f.rarity.length) parts.push(f.rarity.map(localizeQuality).join('/'));
  const stats = f.stats.filter((s) => s.enabled);
  const row = (s: StatFilter) =>
    `${s.kind === 'corruption' ? '已腐化 ' : ''}${filterName(s)}${s.min != null ? ` ≥${s.min}` : ''}`;
  const required = stats.filter((s) => !s.or).map(row);
  const anyOf = stats.filter((s) => s.or).map(row);
  if (anyOf.length) required.push(`任意一项（${anyOf.join(' / ')}）`);
  if (required.length) parts.push(required.join(', '));
  if (f.sellerName) parts.push(`卖家：${f.sellerName}`);
  parts.push(`${f.hardcore ? '专家模式' : '普通模式'} · ${f.ladder ? '天梯' : '非天梯'}${f.source === 'archive' ? ' · 已售' : ''}`);
  return parts.join(' · ');
}

export interface SavedSearchesProps {
  store: MarketStore;
  current: MarketFilters;
  onRun: (search: SavedSearch) => void;
}

/** Saved tab: run, rename, delete, live-alert toggle and "save current search". */
export function SavedSearches({ store, current, onRun }: SavedSearchesProps) {
  const [name, setName] = useState('');
  const alerting = store.savedSearches.filter((s) => s.alert).length;
  const synced = store.syncStatus === 'ready';
  // Opening the tab retries a failed load right away
  useEffect(() => {
    retrySavedSearchSync();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!store.saveSearch(trimmed, current)) return;
    setName('');
    showToast({ title: '搜索已保存', description: trimmed, variant: 'success' });
  };

  const remove = (search: SavedSearch) => {
    const removed = store.removeSearch(search.id);
    if (!removed) return;
    undoToast({
      title: '搜索已删除',
      description: removed.name,
      duration: UNDO_MS,
      onUndo: () => store.restoreSearch(removed),
    });
  };

  const toggleAlert = (search: SavedSearch, on: boolean) => {
    if (!store.setSearchAlert(search.id, on)) {
      showToast({
        title: '提醒数量已达上限',
        description: `最多可同时提醒 ${store.limits.maxAlerting} 个已保存搜索，请先关闭一个提醒。`,
        variant: 'warning',
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form onSubmit={save}
        className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Input
          aria-label="当前搜索的名称"
          placeholder={`保存当前搜索…（${describeFilters(current)}）`}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(fieldInputClass, 'flex-1')}
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={!name.trim() || !synced}
          title={synced ? undefined : '请先从 pd2trader.com 加载已保存的搜索'}
        >
          <Plus className="size-3.5" />
          保存
        </Button>
      </form>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{`${alerting}/${store.limits.maxAlerting} 个提醒 · 悬浮层运行时弹出新匹配结果`}</span>
        <label className="flex items-center gap-1.5">
          提醒
          <Switch
            checked={store.alertsEnabled}
            onCheckedChange={store.setAlertsEnabled}
            aria-label="启用实时提醒"
            className="scale-75"
          />
        </label>
      </div>
      {store.syncStatus === 'signedOut' ? (
        <EmptyState
          className="m-4"
          icon={<Bookmark />}
          title="登录以保存搜索"
          description="已保存的搜索和提醒会与 pd2trader.com 上的 PD2 账号同步。"
        />
      ) : store.syncStatus === 'loading' && store.savedSearches.length === 0 ? (
        <EmptyState className="m-4"
          icon={<Bookmark />}
          title="正在加载已保存的搜索…" />
      ) : store.syncStatus === 'error' && store.savedSearches.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={<Bookmark />}
          title="无法加载已保存的搜索"
          description="pd2trader.com 暂无响应，正在自动重试；加载完成前无法保存搜索或开启提醒。"
          action={
            <Button size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={retrySavedSearchSync}>
              <RotateCw className="size-3.5" />
              立即重试
            </Button>
          }
        />
      ) : store.savedSearches.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={<Bookmark />}
          title="没有已保存的搜索"
          description="先在“搜索”页设置筛选条件，再保存到这里；也可以开启提醒，以便一键重复搜索或在有新挂单时收到通知。"
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <ul className="divide-y divide-border/50">
            {store.savedSearches.map((s) => (
              <SavedRow
                key={s.id}
                search={s}
                onRun={() => onRun(s)}
                onRename={(n) => store.renameSearch(s.id, n)}
                onRemove={() => remove(s)}
                onAlert={(on) => toggleAlert(s, on)}
                alertsEnabled={store.alertsEnabled}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

function SavedRow({
  search,
  onRun,
  onRename,
  onRemove,
  onAlert,
  alertsEnabled,
}: {
  search: SavedSearch;
  onRun: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAlert: (on: boolean) => void;
  alertsEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(search.name);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== search.name) onRename(trimmed);
    setEditing(false);
  };
  return (
    <li className="group flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30">
      <Button
        variant="ghost"
        size="sm"
        className="size-7 shrink-0 p-0 text-primary"
        aria-label={`运行搜索：${search.name}`}
        onClick={onRun}
      >
        <Play className="size-3.5" />
      </Button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <Input
              autoFocus
              aria-label="搜索名称"
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setDraft(search.name);
                  setEditing(false);
                }
              }}
              className={fieldInputClass}
            />
            <Button type="submit"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              aria-label="保存名称">
              <Check className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              aria-label="取消重命名"
              onClick={() => {
                setDraft(search.name);
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onRun}
            className="block w-full min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <div className="truncate text-sm font-medium">{search.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {`${describeFilters(search.filters)} · 保存于 ${moment(search.createdAt).fromNow()}`}
            </div>
          </button>
        )}
      </div>
      {!editing && (
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`重命名：${search.name}`}
          onClick={() => {
            setDraft(search.name);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
      <label
        className="flex shrink-0 items-center gap-1"
        title={alertsEnabled ? '新匹配结果将显示通知' : '提醒已关闭（请使用上方开关）'}
      >
        {search.alert && alertsEnabled ? (
          <Bell className="size-3.5 text-primary" />
        ) : (
          <BellOff className="size-3.5 text-muted-foreground" />
        )}
        <Switch
          checked={search.alert}
          onCheckedChange={onAlert}
          aria-label={`${search.name} 的提醒`}
          className="scale-75"
        />
      </label>
      <Button
        variant="ghost"
        size="sm"
        className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        aria-label={`删除搜索：${search.name}`}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}
