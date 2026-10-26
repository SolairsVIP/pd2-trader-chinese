// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetch as tauriFetch } from '@/lib/browser-http';
import { useStashCache } from './useStashCache';
import { useMarketActions } from './useMarketActions';
import type { ISettings } from '../useOptions';
import type { AuthData } from '@/common/types/pd2-website/AuthResponse';
import type { Item } from '@/pages/price-check/lib/interfaces';

vi.mock('@/lib/browser-http', () => ({ fetch: vi.fn() }));
vi.mock('@/lib/error-reporting', () => ({ reportApiError: vi.fn() }));
afterEach(cleanup);

describe('real game input -> official stash matching -> listing boundary', () => {
  it('matches the user Gul Rune copy without name/stats and submits the original website item', async () => {
    const official = { hash: 'official-gul', name: 'Gul Rune', base: { name: 'Gul Rune' },
      quality: { name: 'Normal' }, modifiers: [] };
    const otherRune = { ...official, hash: 'official-vex', name: 'Vex Rune', base: { name: 'Vex Rune' } };
    vi.mocked(tauriFetch).mockReset();
    vi.mocked(tauriFetch).mockImplementation(async (_url, init) => ({
      ok: true, status: 200,
      json: async () => init?.method === 'POST' ? { _id: 'rune-listing' } : { items: [otherRune, official] },
    }) as Response);
    const settings = { pd2Token: 'test', account: 'TestAccount', mode: 'softcore', ladder: 'ladder' } as ISettings;
    const authData = { user: { _id: 'test-user' } } as AuthData;
    const { result } = renderHook(() => {
      const cache = useStashCache(authData, settings);
      return useMarketActions({ settings, authData, ...cache });
    });
    const candidates = await result.current.findMatchingItems({ iLevel: 99, isRune: true,
      location: 'Stash', quality: 'Normal', type: 'ç¬¦æ–‡ï¼šå¤å°”' } as unknown as Item, { forceRefresh: true });
    expect(candidates).toEqual([official]);
    expect(candidates[0]).toBe(official);
    await result.current.listSpecificItem(candidates[0], 0, '1wss', 'note');
    const post = vi.mocked(tauriFetch).mock.calls.findLast(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1]!.body as string).item).toEqual({ ...official, account_id: 'testaccount' });
    expect(official).not.toHaveProperty('account_id');
  });

  it.each(['Cryptic Axe', '神秘之斧 Cryptic Axe', 'ç¥žç§˜ä¹‹æ–§ Cryptic Axe'])(
    'matches Tomb Reaver with base %s and submits the original website hash/modifiers', async (type) => {
      const official = { hash: 'official-tomb', name: 'Tomb Reaver', base: { name: 'Cryptic Axe' },
        quality: { name: 'Unique' }, socket_count: 3, modifiers: [
          { name: 'item_fasterattackrate', label: '60% Increased Attack Speed', values: [60] },
          { name: 'fireresist', label: 'Fire Resist +46%', values: [46] },
        ] };
      const differentQuality = { ...official, hash: 'rare-axe', quality: { name: 'Rare' } };
      vi.mocked(tauriFetch).mockImplementation(async (_url, init) => ({
        ok: true, status: 200,
        json: async () => init?.method === 'POST' ? { _id: 'listing' } : { items: [differentQuality, official] },
      }) as Response);
      const settings = { pd2Token: 'test', account: 'TestAccount', mode: 'softcore', ladder: 'ladder' } as ISettings;
      const authData = { user: { _id: 'test-user' } } as AuthData;
      const { result } = renderHook(() => {
        const cache = useStashCache(authData, settings);
        return useMarketActions({ settings, authData, ...cache });
      });
      const candidates = await result.current.findMatchingItems({
        iLevel: 90, name: 'Tomb Reaver', quality: 'Unique', type, sockets: 3,
        stats: [{ name: 'æå‡æ”»å‡»é€Ÿåº¦', stat_id: 93, value: 60 }],
      }, { forceRefresh: true });
      expect(candidates).toEqual([official]);
      expect(candidates[0]).toBe(official);
      await result.current.listSpecificItem(candidates[0], 0, '2wss', 'note');
      const post = vi.mocked(tauriFetch).mock.calls.findLast(([, init]) => init?.method === 'POST')!;
      expect(JSON.parse(post[1]!.body as string).item).toEqual({ ...official, account_id: 'testaccount' });
      expect(official).not.toHaveProperty('account_id');
    },
  );
});
