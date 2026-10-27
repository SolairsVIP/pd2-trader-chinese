// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from '@/overlay';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import { FavoriteAccessError } from '../lib/favorite-access';
import { readLocalFavorites, saveLocalFavorites } from '../lib/local-favorites';
import type { MarketApi, MarketFavorite } from '../lib/types';
import { useMarketFavorites } from './useMarketFavorites';

vi.mock('@/overlay', () => ({ showToast: vi.fn() }));

const fav = (id: string): MarketFavorite => ({
  _id: `f-${id}`,
  listing_id: id,
  seller_id: 's',
  user_id: 'u',
  created_at: '2026-10-21T00:00:00Z',
});

/** getFavorites resolves only when the test says so, per call. */
function deferredApi() {
  const calls: { resolve: (v: { total: number; data: MarketFavorite[] }) => void; reject: (e: Error) => void }[] = [];
  const getFavorites = vi.fn(
    () =>
      new Promise<{ total: number; data: MarketFavorite[] }>((resolve, reject) => {
        calls.push({ resolve, reject });
      }),
  );
  return { api: { getFavorites } as unknown as MarketApi, calls };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

const item = (id: string) => ({ _id: id, user_id: 'seller' }) as MarketListingEntry;
const readyApi = () => ({
  getFavorites: vi.fn().mockResolvedValue({ total: 0, data: [] }),
  addFavorite: vi.fn(), removeFavorite: vi.fn(),
}) as unknown as MarketApi;

describe('useMarketFavorites', () => {
  it('keeps local changes across repeated reopenings and separates two accounts', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockImplementation(async () => { throw new FavoriteAccessError('alice'); });
    const { result, unmount } = renderHook(() => useMarketFavorites(api, true, 'alice'));
    await waitFor(() => expect(result.current.source).toBe('local'));
    for (let i = 0; i < 30; i++) await act(async () => result.current.toggle(item(`L${i}`)));
    for (let i = 0; i < 10; i++) await act(async () => result.current.toggle(item(`L${i}`)));
    expect(result.current.favorites).toHaveLength(20);
    unmount();
    const reopened = renderHook(() => useMarketFavorites(api, true, 'alice'));
    await waitFor(() => expect(reopened.result.current.favorites).toHaveLength(20));
    expect(readLocalFavorites('alice')?.map((f) => f.listing_id).sort())
      .toEqual(Array.from({ length: 20 }, (_, i) => `L${i + 10}`).sort());
    expect(readLocalFavorites('bob')).toBeNull();
  });

  it('ignores duplicate clicks during an outstanding website write and retains the confirmed result', async () => {
    const api = readyApi();
    const request = Promise.withResolvers<MarketFavorite>();
    vi.mocked(api.addFavorite).mockReturnValue(request.promise);
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let first!: Promise<void>;
    act(() => { first = result.current.toggle(item('L1')); });
    await act(async () => result.current.toggle(item('L1')));
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve(fav('L1')); await first; });
    expect(result.current.favorites.map((f) => f._id)).toEqual(['f-L1']);
  });

  it('restores a website favorite after a failed delete', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockResolvedValue({ total: 1, data: [fav('L1')] });
    vi.mocked(api.removeFavorite).mockRejectedValue(new Error('invalid request'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));
    await act(async () => result.current.toggle(item('L1')));
    expect(result.current.favorites.map((f) => f._id)).toEqual(['f-L1']);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('stores favorites locally after a verified endpoint denial, including reopening, removing and account isolation', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValue(new FavoriteAccessError('u'));
    const { result, unmount } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.source).toBe('local'));
    await act(async () => result.current.toggle(item('L1')));
    expect(readLocalFavorites('u')?.map((f) => f.listing_id)).toEqual(['L1']);
    expect(readLocalFavorites('other')).toBeNull();
    expect(api.addFavorite).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '已保存到本机收藏' }));
    unmount();

    const reopened = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(reopened.result.current.favorites).toHaveLength(1));
    expect(api.getFavorites).toHaveBeenCalledTimes(2);
    await act(async () => reopened.result.current.toggle(item('L1')));
    expect(readLocalFavorites('u')).toEqual([]);
    expect(api.removeFavorite).not.toHaveBeenCalled();
  });

  it('keeps an optimistically added item only when local fallback has actually saved it', async () => {
    const api = readyApi();
    vi.mocked(api.addFavorite).mockRejectedValue(new FavoriteAccessError('u'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => result.current.toggle(item('L1')));
    expect(result.current.source).toBe('local');
    expect(result.current.favorites[0]._id).toBe('local:L1');
    expect(readLocalFavorites('u')).toEqual(result.current.favorites);
  });

  it('rolls back an add that returns no saved favorite instead of keeping a false red heart', async () => {
    const api = readyApi();
    vi.mocked(api.addFavorite).mockResolvedValue(null as never);
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => result.current.toggle(item('L1')));
    expect(result.current.favorites).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(readLocalFavorites('u')).toBeNull();
  });

  it('rolls back a denied delete, but does not change another account on a late failure', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockResolvedValue({ total: 1, data: [fav('L1')] });
    const deferred = Promise.withResolvers<void>();
    vi.mocked(api.removeFavorite).mockReturnValue(deferred.promise);
    const { result, rerender } = renderHook(({ signedIn }) => useMarketFavorites(api, signedIn, 'u'), {
      initialProps: { signedIn: true },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let request!: Promise<void>;
    act(() => { request = result.current.toggle(item('L1')); });
    expect(result.current.favorites).toEqual([]);
    rerender({ signedIn: false });
    await act(async () => { deferred.reject(new Error('network')); await request; });
    expect(result.current.favorites).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('preserves existing local favorites when storage fills and does not claim success', async () => {
    saveLocalFavorites('u', [{ ...fav('L0'), listing: item('L0') }]);
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValue(new FavoriteAccessError('u'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.source).toBe('local'));
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      await act(async () => result.current.toggle(item('L1')));
      expect(result.current.favorites.map((f) => f.listing_id)).toEqual(['L0']);
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    } finally { write.mockRestore(); }
  });

  it('does not overwrite damaged local favorites or silently send them to the website', async () => {
    localStorage.setItem('pd2-market-local-favorites-v1:u', '{broken');
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValue(new FavoriteAccessError('u'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(api.getFavorites).toHaveBeenCalled();
    expect(localStorage.getItem('pd2-market-local-favorites-v1:u')).toBe('{broken');
  });
  it('rechecks the website and preserves local favorites when service recovers', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValueOnce(new FavoriteAccessError('u'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.source).toBe('local'));
    await act(async () => result.current.toggle(item('local-item')));
    vi.mocked(api.getFavorites).mockResolvedValue({ total: 1, data: [fav('website-item')] });
    await act(async () => result.current.reload());
    expect(result.current.source).toBe('website');
    expect(result.current.favorites.map(f => f.listing_id)).toEqual(['website-item']);
    expect(readLocalFavorites('u')?.map(f => f.listing_id)).toEqual(['local-item']);
    expect(api.addFavorite).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '已恢复官网收藏' }));
  });
  it('prefers the website even when previous local data exists', async () => {
    saveLocalFavorites('u', [{ ...fav('local-item'), listing: item('local-item') }]);
    const api = readyApi();
    vi.mocked(api.getFavorites).mockResolvedValue({ total: 1, data: [fav('website-item')] });
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.source).toBe('website');
    expect(result.current.favorites.map(f => f.listing_id)).toEqual(['website-item']);
    expect(readLocalFavorites('u')?.map(f => f.listing_id)).toEqual(['local-item']);
  });
  it('checks the website again when the market is reopened', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValueOnce(new FavoriteAccessError('u'));
    const first = renderHook(({ open }) => useMarketFavorites(api, open, 'u'), { initialProps: { open: true } });
    await waitFor(() => expect(first.result.current.source).toBe('local'));
    first.rerender({ open: false });
    first.rerender({ open: true });
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(first.result.current.source).toBe('website');
    expect(api.getFavorites).toHaveBeenCalledTimes(2);
  });
  it('falls back on service failure but does not treat an expired login as offline', async () => {
    const api = readyApi();
    vi.mocked(api.getFavorites).mockRejectedValueOnce(new Error('API Error: 503'));
    const { result } = renderHook(() => useMarketFavorites(api, true, 'u'));
    await waitFor(() => expect(result.current.source).toBe('local'));
    const auth = new Error('登录已失效'); auth.name = 'AuthenticationError';
    vi.mocked(api.getFavorites).mockRejectedValueOnce(auth);
    await act(async () => result.current.reload());
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('登录已失效');
  });
  it('drops a slow load for the previous account when a newer one lands first', async () => {
    const oldAccount = deferredApi();
    const newAccount = deferredApi();
    const { result, rerender } = renderHook(({ api }) => useMarketFavorites(api, true), {
      initialProps: { api: oldAccount.api },
    });
    await waitFor(() => expect(oldAccount.calls).toHaveLength(1));

    rerender({ api: newAccount.api });
    await waitFor(() => expect(newAccount.calls).toHaveLength(1));
    await act(async () => newAccount.calls[0].resolve({ total: 1, data: [fav('new')] }));
    expect(result.current.favorites.map((f) => f.listing_id)).toEqual(['new']);

    await act(async () => oldAccount.calls[0].resolve({ total: 1, data: [fav('old')] }));
    expect(result.current.favorites.map((f) => f.listing_id)).toEqual(['new']);
    expect(result.current.status).toBe('ready');
  });

  it('a load still in flight at sign-out neither fills the list nor reports its error', async () => {
    const { api, calls } = deferredApi();
    const { result, rerender } = renderHook(({ signedIn }) => useMarketFavorites(api, signedIn), {
      initialProps: { signedIn: true },
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    rerender({ signedIn: false });
    expect(result.current).toMatchObject({ favorites: [], status: 'idle' });

    await act(async () => calls[0].resolve({ total: 1, data: [fav('stale')] }));
    expect(result.current).toMatchObject({ favorites: [], status: 'idle', error: null });

    rerender({ signedIn: true });
    await waitFor(() => expect(calls).toHaveLength(2));
    rerender({ signedIn: false });
    await act(async () => calls[1].reject(new Error('API Error: 500')));
    expect(result.current).toMatchObject({ status: 'idle', error: null });
  });
});
