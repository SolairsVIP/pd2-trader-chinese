import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/overlay';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import type { MarketApi, MarketFavorite } from '../lib/types';
import { FavoriteAccessError } from '../lib/favorite-access';
import { readLocalFavorites, saveLocalFavorites } from '../lib/local-favorites';

const FAVORITES_PAGE = 50;
const FAVORITES_MAX = 500;
export type FavoritesStatus = 'idle' | 'loading' | 'ready' | 'error';

function isUnavailable(error: unknown): boolean {
  return error instanceof FavoriteAccessError || error instanceof TypeError ||
    (error instanceof Error && /^(?:API Error: 5\d\d\b|network\b|failed to fetch\b)/i.test(error.message));
}

export interface MarketFavorites {
  favorites: MarketFavorite[];
  status: FavoritesStatus;
  error: string | null;
  source: 'website' | 'local';
  reload: () => Promise<void>;
  toggle: (listing: MarketListingEntry) => Promise<void>;
}

/** Website favorites where supported; explicit, account-scoped local storage when OAuth is denied. */
export function useMarketFavorites(api: MarketApi | null, signedIn: boolean, userId = ''): MarketFavorites {
  const [favorites, setFavorites] = useState<MarketFavorite[]>([]);
  const [status, setStatus] = useState<FavoritesStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'website' | 'local'>('website');
  const rows = useRef(favorites);
  const localUser = useRef('');
  const recoveryNotice = useRef(false);
  const pending = useRef(new Set<string>());
  const loadId = useRef(0);
  // Late writes must not change another login's list (or an unmounted panel).
  const session = useRef({ api, signedIn, userId });
  if (session.current.api !== api || session.current.signedIn !== signedIn || session.current.userId !== userId) {
    session.current = { api, signedIn, userId };
    localUser.current = '';
    recoveryNotice.current = false;
    pending.current = new Set();
  }

  const commit = useCallback((next: MarketFavorite[]) => {
    rows.current = next;
    setFavorites(next);
  }, []);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    const owner = session.current;
    const current = () => id === loadId.current && owner === session.current;
    setError(null);
    if (!api || !signedIn) {
      commit([]);
      setSource('website');
      setStatus('idle');
      return;
    }
    commit([]);
    setStatus('loading');
    try {
      const all: MarketFavorite[] = [];
      for (let skip = 0; skip < FAVORITES_MAX; skip += FAVORITES_PAGE) {
        const page = await api.getFavorites({ limit: FAVORITES_PAGE, skip });
        if (!current()) return;
        if (!page) throw new Error('请登录后重新加载收藏。');
        all.push(...page.data);
        if (page.data.length < FAVORITES_PAGE || all.length >= page.total) break;
      }
      let hasLocal = !!localUser.current;
      if (!hasLocal && userId && !recoveryNotice.current) {
        try { hasLocal = (readLocalFavorites(userId)?.length ?? 0) > 0; } catch { /* Keep damaged local data untouched. */ }
      }
      localUser.current = '';
      commit(all);
      setSource('website');
      setStatus('ready');
      if (hasLocal && !recoveryNotice.current) {
        recoveryNotice.current = true;
        showToast({ title: '已恢复官网收藏', description: '本机收藏仍保留在当前设备，不会自动上传官网。' });
      }
    } catch (e) {
      if (!current()) return;
      const ownerId = e instanceof FavoriteAccessError ? e.userId : userId;
      if (ownerId && (!userId || userId === ownerId) && isUnavailable(e)) {
        try {
          const stored = readLocalFavorites(ownerId) ?? [];
          localUser.current = ownerId;
          commit(stored);
          setSource('local');
          setStatus('ready');
          return;
        } catch (storageError) { e = storageError; }
      }
      setError(e instanceof Error && /[\u3400-\u9fff]/.test(e.message) ? e.message.split('\n')[0] : '无法加载收藏列表，请稍后重试。');
      setStatus('error');
    }
  }, [api, signedIn, userId, commit]);

  useEffect(() => {
    void load();
    return () => { ++loadId.current; };
  }, [load]);

  const toggle = useCallback(async (listing: MarketListingEntry) => {
    // Serialize writes so fallback cannot persist another in-flight optimistic change.
    if (!api || !signedIn || status !== 'ready' || pending.current.size > 0) return;
    const owner = session.current;
    const id = loadId.current;
    const active = () => owner === session.current && id === loadId.current;
    const inFlight = pending.current;
    inFlight.add(listing._id);
    const existing = rows.current.find((f) => f.listing_id === listing._id);
    const optimistic: MarketFavorite = {
      _id: `pending:${listing._id}`, listing_id: listing._id, seller_id: listing.user_id,
      user_id: userId, created_at: new Date().toISOString(), listing,
    };
    const updated = () => existing
      ? rows.current.filter((f) => f.listing_id !== listing._id)
      : [optimistic, ...rows.current.filter((f) => f.listing_id !== listing._id)];
    try {
      if (localUser.current) {
        commit(saveLocalFavorites(localUser.current, updated()));
        if (!existing) showToast({ title: '已保存到本机收藏', description: '收藏仅保存在当前设备，不同步 PD2 官网。' });
        return;
      }
      commit(updated());
      try {
        if (existing) await api.removeFavorite(existing._id);
        else {
          const created = await api.addFavorite(listing._id, listing.user_id);
          if (!created?._id) throw new Error('官网未确认收藏操作，请稍后重试。');
          if (active()) commit(rows.current.map((f) => f._id === optimistic._id ? { ...created, listing } : f));
        }
      } catch (e) {
        if (!active()) return;
        const ownerId = e instanceof FavoriteAccessError ? e.userId : userId;
        if (ownerId && (!userId || userId === ownerId) && isUnavailable(e)) {
          const prior = readLocalFavorites(ownerId) ?? [];
          const merged = [...rows.current, ...prior.filter((f) => !existing || f.listing_id !== listing._id)];
          commit(saveLocalFavorites(ownerId, merged));
          localUser.current = ownerId;
          setSource('local');
          showToast({ title: '已切换为本机收藏', description: '官网收藏暂不可用；本机收藏仅保存在当前设备，不会自动上传。' });
          return;
        }
        throw e;
      }
    } catch (e) {
      if (!active()) return;
      // Roll back only this listing; other concurrent toggles keep their results.
      if (!localUser.current) commit(existing
        ? [existing, ...rows.current.filter((f) => f.listing_id !== listing._id)]
        : rows.current.filter((f) => f.listing_id !== listing._id));
      showToast({
        title: existing ? '未能取消收藏' : '未能添加收藏',
        description: e instanceof Error && /[\u3400-\u9fff]/.test(e.message)
          ? e.message : '未能保存此更改，请稍后重试。',
        variant: 'error',
      });
    } finally {
      inFlight.delete(listing._id);
    }
  }, [api, signedIn, userId, status, commit]);

  return { favorites, status, error, source, reload: load, toggle };
}
