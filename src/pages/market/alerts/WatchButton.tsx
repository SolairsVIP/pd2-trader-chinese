import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Eye, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT, springSnappy } from '@/lib/motion';
import { showToast, usePanel } from '@/overlay';
import type { MarketFilters } from '@/pages/market/lib/types';
import { isPendingSearch, retrySavedSearchSync, useMarketStore } from '@/pages/market/store/useMarketStore';
import { findWatch } from './alert-logic';

/**
 * "Watch" the current market filters: a popup and a sound for every new listing that matches them (an alerting
 * saved search on pd2trader.com). Shows "Watching" while one exists for identical filters; clicking it again
 * stops watching (the saved search stays, without alerts).
 */
export function WatchButton({ filters, className }: { filters: MarketFilters | null; className?: string }) {
  const store = useMarketStore();
  const { visible } = usePanel<'market'>();
  // Saved searches failed to load: try again whenever the market panel shows (the store also retries on a timer)
  useEffect(() => {
    if (visible) retrySavedSearchSync();
  }, [visible]);
  const { watching, saved } = filters ? findWatch(store.savedSearches, filters) : { watching: null, saved: null };
  const signedOut = store.syncStatus === 'signedOut';
  /** Without the list, Watch can't tell an existing watch from a new one (it would save duplicates). */
  const unsynced = store.syncStatus === 'error';
  const archive = filters?.source === 'archive';
  const busy = (watching && isPendingSearch(watching)) || store.syncStatus === 'loading';
  const disabled = !filters || signedOut || unsynced || (archive && !watching) || !!busy;
  // One soft pulse when watching starts (not when the panel opens on a watched search)
  const [pulses, setPulses] = useState(0);
  const [wasWatching, setWasWatching] = useState(!!watching);
  if (!!watching !== wasWatching) {
    setWasWatching(!!watching);
    if (watching) setPulses((n) => n + 1);
  }

  const toggle = () => {
    if (!filters) return;
    if (watching) {
      store.setSearchAlert(watching.id, false);
      showToast({ title: '已关闭提醒', description: watching.name, variant: 'info' });
      return;
    }
    if (!store.alertsEnabled) store.setAlertsEnabled(true);
    if (saved && !isPendingSearch(saved)) {
      if (!store.setSearchAlert(saved.id, true)) {
        showToast({
          title: '提醒数量已达上限',
          description: `最多可同时提醒 ${store.limits.maxAlerting} 个搜索，请先在“已保存”页关闭一个提醒。`,
          variant: 'warning',
        });
      }
      return;
    }
    if (store.saveSearch(undefined, filters, true)) {
      showToast({
        title: '已开启提醒',
        description: '有符合此搜索条件的新挂单时，你会收到弹窗通知。',
        variant: 'success',
      });
    }
  };

  const label = signedOut
    ? '登录以开启此搜索的提醒'
    : unsynced
      ? '无法从 pd2trader.com 加载已保存的搜索，正在重试…'
      : archive && !watching
        ? '无法为已售挂单开启提醒'
        : watching
          ? '提醒已开启；点击可关闭此搜索的新挂单弹窗'
          : '开启提醒：有符合此搜索条件的新挂单时播放提示音并显示弹窗';

  return (
    <button
      type="button"
      aria-pressed={!!watching}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-input bg-background/40 px-2 text-[11px] font-medium text-muted-foreground outline-none',
        'transition-[color,background-color,border-color] duration-(--dur-fast) hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
        // Disabled keeps hover so the title says why
        'disabled:cursor-not-allowed disabled:opacity-50',
        watching && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        className,
      )}
    >
      {pulses > 0 && (
        <motion.span
          key={pulses}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary/60"
          initial={{ opacity: 0.9, scale: 1 }}
          animate={{ opacity: 0, scale: 1.25 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        />
      )}
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <AnimatePresence initial={false}
          mode="popLayout">
          <motion.span
            key={busy ? 'busy' : watching ? 'bell' : 'eye'}
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
            transition={springSnappy}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : watching ? (
              <Bell className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      {watching ? '提醒中' : '开启提醒'}
    </button>
  );
}
