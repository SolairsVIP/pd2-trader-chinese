// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListingActions } from './useListingActions';
import { listing } from '../lib/test-utils';

const openPanel = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ buyerId: 'buyer-test' as string | null }));
vi.mock('@/overlay', () => ({ useOverlay: () => ({ openPanel }), showToast: vi.fn() }));
vi.mock('@/hooks/useChatTemplates', () => ({ useChatTemplates: () => ({ templates: [] }) }));
vi.mock('@/hooks/pd2website/usePD2Website', () => ({ usePd2Website: () => ({ marketApi: null, authData: session.buyerId ? { user: { _id: session.buyerId } } : null }) }));

describe('opened seller chats', () => {
  it('marks other listings from the same seller after opening chat, without marking another seller', () => {
    const first = listing({id:'test-a'});
    const sameSeller = listing({id:'test-b'});
    const otherSeller = { ...listing({id:'test-c'}), user_id: 'seller-other' };
    const a = renderHook(() => useListingActions(first));
    const b = renderHook(() => useListingActions(sameSeller));
    const c = renderHook(() => useListingActions(otherSeller));
    expect(b.result.current.chatOpened).toBe(false);
    act(() => a.result.current.openDm());
    expect(openPanel).toHaveBeenCalled();
    expect(a.result.current.chatOpened).toBe(true);
    expect(b.result.current.chatOpened).toBe(true);
    expect(c.result.current.chatOpened).toBe(false);
  });

  it('does not carry a marker to another buyer or mark an anonymous session', () => {
    const item = { ...listing({id:'test-d'}), user_id: 'seller-private' };
    const a = renderHook(() => useListingActions(item));
    act(() => a.result.current.openDm());
    expect(a.result.current.chatOpened).toBe(true);
    session.buyerId = 'another-buyer';
    a.rerender();
    expect(a.result.current.chatOpened).toBe(false);
    session.buyerId = null;
    a.rerender();
    act(() => a.result.current.openDm());
    session.buyerId = 'another-buyer';
    a.rerender();
    expect(a.result.current.chatOpened).toBe(false);
    session.buyerId = 'buyer-test';
  });
});
