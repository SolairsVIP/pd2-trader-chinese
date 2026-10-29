// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { showToast } from '@/overlay';
import { useInView } from 'react-intersection-observer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePd2Website } from '@/hooks/pd2website/usePD2Website';
import { useOptions } from '@/hooks/useOptions';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import type { MarketListingQuery } from '@/common/types/pd2-website/GetMarketListingsCommand';
import ListedItemsTab from './ListedItemsTab';

vi.mock('@/overlay', () => ({ showToast: vi.fn() }));
vi.mock('framer-motion', () => import('@/pages/quick-list/motion-mock'));
vi.mock('@/hooks/pd2website/usePD2Website', () => ({ usePd2Website: vi.fn() }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/lib/browser-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), trackMeasurement: vi.fn() }));
vi.mock('react-intersection-observer', () => ({ useInView: vi.fn() }));

const NOW = new Date('2026-03-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

function makeListing(n: number, over: Partial<MarketListingEntry> = {}): MarketListingEntry {
  return {
    _id: `L${n}`,
    price: '',
    hr_price: 0,
    bumped_at: hoursAgo(24),
    created_at: hoursAgo(48),
    item: {
      hash: `h${n}`,
      name: `Item ${n}`,
      base: { name: `Base ${n}` },
      quality: { name: 'Unique' },
      modifiers: [{ name: 'fcr', label: `+${n}% Faster Cast Rate` }],
      socket_count: 0,
    },
    ...over,
  } as unknown as MarketListingEntry;
}

type Api = {
  getMarketListings: Mock<(q: MarketListingQuery) => Promise<{ data: MarketListingEntry[]; total: number }>>;
  updateMarketListing: Mock<(id: string, fields: Record<string, unknown>) => Promise<void>>;
  updateItemByHash: Mock<(hash: string, fields: Record<string, unknown>) => Promise<void>>;
  deleteMarketListing: Mock<(id: string) => Promise<void>>;
  bumpAllMarketListings: Mock<(userId: string) => Promise<void>>;
  authData: { user: { _id: string } } | null;
};

let server: MarketListingEntry[];
let api: Api;
let inView: boolean;
const queries: { limit: number; skip: number; hc: boolean; ladder: boolean }[] = [];

const toasts = () => vi.mocked(showToast).mock.calls.map(([p]) => p);
const row = (name: string) => screen.getByText(name).closest<HTMLElement>('[class*="rounded"][class*="border"]')!;
const countChip = () => screen.getByText('已上架物品').querySelector('span')!.textContent;

function renderTab(props: Partial<React.ComponentProps<typeof ListedItemsTab>> = {}) {
  return render(
    <TooltipProvider>
      <ListedItemsTab onClose={vi.fn()}
        {...props} />
    </TooltipProvider>,
  );
}

async function click(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  server = Array.from({ length: 7 }, (_, i) => makeListing(i + 1));
  queries.length = 0;
  inView = false;
  api = {
    getMarketListings: vi.fn(async (q) => {
      queries.push({ limit: q.$limit, skip: q.$skip, hc: q.is_hardcore, ladder: q.is_ladder });
      return { data: server.slice(q.$skip, q.$skip + q.$limit), total: server.length };
    }),
    updateMarketListing: vi.fn(async () => {}),
    updateItemByHash: vi.fn(async () => {}),
    deleteMarketListing: vi.fn(async (id) => {
      server = server.filter((l) => l._id !== id);
    }),
    bumpAllMarketListings: vi.fn(async () => {}),
    authData: { user: { _id: 'u1' } },
  };
  vi.mocked(usePd2Website).mockImplementation(() => api as never);
  // The real provider hands out a stable settings object; a fresh one per render would refire every query memo.
  const options = { settings: { mode: 'hardcore', ladder: 'non-ladder' } };
  vi.mocked(useOptions).mockImplementation(() => options as never);
  vi.mocked(useInView).mockImplementation(() => ({ ref: vi.fn(), inView }) as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('loading', () => {
  it('fetches the first page for the current realm on mount and reports it to the parent', async () => {
    const onTotalCountChange = vi.fn();
    const onListingsChange = vi.fn();
    renderTab({ onTotalCountChange, onListingsChange });
    expect(screen.queryByText('正在加载挂单…')).not.toBeNull();
    await screen.findByText('Item 1');
    expect(queries[0]).toEqual({ limit: 5, skip: 0, hc: true, ladder: false });
    expect(screen.queryByText('Item 5')).not.toBeNull();
    expect(screen.queryByText('Item 6')).toBeNull();
    expect(countChip()).toBe('7');
    expect(onTotalCountChange).toHaveBeenLastCalledWith(7);
    expect(onListingsChange.mock.lastCall![0].map((l: MarketListingEntry) => l._id)).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
    ]);
  });

  it('uses parent-provided first page without fetching, capped to one page', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    expect(screen.queryByText('Item 5')).not.toBeNull();
    expect(screen.queryByText('Item 6')).toBeNull();
    expect(api.getMarketListings).not.toHaveBeenCalled();
  });

  it('refreshes the first page when new listings appear before an existing row', async () => {
    const oldFirstPage = [server[0], server[1], server[2], server[5]];
    const view = renderTab({ initialListings: oldFirstPage, initialTotalCount: 4 });
    view.rerender(
      <TooltipProvider>
        <ListedItemsTab onClose={vi.fn()} initialListings={server.slice(0, 5)} initialTotalCount={6} />
      </TooltipProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTitle('Item 4')).not.toBeNull();
      expect(screen.getByTitle('Item 5')).not.toBeNull();
    });
  });

  it('manually refreshes from the first page when the market changes', async () => {
    renderTab({ initialListings: [server[0], server[1], server[2], server[5]], initialTotalCount: 4 });
    await click(screen.getByRole('button', { name: '刷新挂单' }));
    expect(await screen.findByTitle('Item 4')).not.toBeNull();
    expect(screen.getByTitle('Item 5')).not.toBeNull();
    expect(queries).toContainEqual({ limit: 5, skip: 0, hc: true, ladder: false });
  });

  it('preserves existing listings and reports a failed manual refresh', async () => {
    renderTab({ initialListings: server.slice(0, 5), initialTotalCount: 7 });
    api.getMarketListings.mockRejectedValueOnce(new Error('offline'));
    await click(screen.getByRole('button', { name: '刷新挂单' }));
    expect(screen.getByTitle('Item 1')).not.toBeNull();
    expect(showToast).toHaveBeenCalled();
  });

  async function scrollToSentinel() {
    const view = renderTab({ initialListings: server, initialTotalCount: 7 });
    inView = true;
    view.rerender(
      <TooltipProvider>
        <ListedItemsTab onClose={vi.fn()}
          initialListings={server}
          initialTotalCount={7} />
      </TooltipProvider>,
    );
    await screen.findByText('Item 7');
    await act(async () => {});
  }

  it('loads the next page when the scroll sentinel comes into view, without duplicating rows', async () => {
    await scrollToSentinel();
    expect(new Set(queries.map((q) => q.skip))).toEqual(new Set([5]));
    expect(screen.getAllByText('Item 1')).toHaveLength(1);
    expect(screen.getAllByText('Item 6')).toHaveLength(1);
  });

  it('requests each page only once', async () => {
    await scrollToSentinel();
    expect(queries).toEqual([{ limit: 5, skip: 5, hc: true, ladder: false }]);
  });

  it('shows an error with a working Retry when the first fetch fails', async () => {
    api.getMarketListings.mockRejectedValueOnce(new Error('Gateway timeout'));
    renderTab();
    await screen.findByText('请求超时，请稍后重试。');
    await click(screen.getByRole('button', { name: /重试/ }));
    await screen.findByText('Item 1');
    expect(screen.queryByText('无法加载挂单')).toBeNull();
  });

  it('distinguishes "no listings" from "not signed in"', async () => {
    server = [];
    const view = renderTab();
    await screen.findByText('没有正在出售的挂单');
    view.unmount();

    api.authData = null;
    renderTab();
    expect(screen.queryByText('尚未登录')).not.toBeNull();
    expect((screen.getByRole('button', { name: /全部置顶/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('bumping', () => {
  it('bumps an eligible listing and puts it on cooldown', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    const bump = within(row('Item 2')).getByRole('button', { name: /^置顶$/ }) as HTMLButtonElement;
    await click(bump);
    expect(api.updateMarketListing.mock.calls[0][0]).toBe('L2');
    expect(api.updateItemByHash.mock.calls[0][0]).toBe('h2');
    expect(toasts()).toEqual(['物品已成功置顶！']);
    const after = within(row('Item 2')).getByRole('button', { name: /置顶/ }) as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    // Others are untouched.
    expect((within(row('Item 1')).getByRole('button', { name: /置顶/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps a listing bumped under 12h ago on cooldown', () => {
    server[0] = makeListing(1, { bumped_at: hoursAgo(11) });
    renderTab({ initialListings: server, initialTotalCount: 7 });
    expect((within(row('Item 1')).getByRole('button', { name: /置顶/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a failed bump and leaves the listing bumpable', async () => {
    api.updateMarketListing.mockRejectedValueOnce(new Error('nope'));
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await click(within(row('Item 1')).getByRole('button', { name: /置顶/ }));
    expect(toasts()).toEqual(['置顶物品失败。']);
    expect((within(row('Item 1')).getByRole('button', { name: /置顶/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Bump All bumps every listing for the signed-in user', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await click(screen.getByRole('button', { name: /全部置顶/ }));
    expect(api.bumpAllMarketListings.mock.calls).toEqual([['u1']]);
    expect(toasts()).toEqual(['所有物品均已成功置顶！']);
    for (const name of ['Item 1', 'Item 5']) {
      expect((within(row(name)).getByRole('button', { name: /置顶/ }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('Bump All failure leaves listings bumpable', async () => {
    api.bumpAllMarketListings.mockRejectedValueOnce(new Error('x'));
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await click(screen.getByRole('button', { name: /全部置顶/ }));
    expect(toasts()).toEqual(['批量置顶失败。']);
    expect((within(row('Item 1')).getByRole('button', { name: /置顶/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Bump All refuses without authentication', async () => {
    api.authData = null;
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await click(screen.getByRole('button', { name: /全部置顶/ }));
    expect(api.bumpAllMarketListings).not.toHaveBeenCalled();
    expect(toasts()).toEqual(['无法置顶挂单：请先登录。']);
  });
});

describe('deleting', () => {
  it('removes the row, decrements the count and informs the parent', async () => {
    const onTotalCountChange = vi.fn();
    const onListingsChange = vi.fn();
    renderTab({ initialListings: server, initialTotalCount: 7, onTotalCountChange, onListingsChange });
    await click(within(row('Item 3')).getByLabelText('删除挂单'));
    expect(api.deleteMarketListing.mock.calls).toEqual([['L3']]);
    expect(screen.queryByText('Item 3')).toBeNull();
    expect(countChip()).toBe('6');
    expect(onTotalCountChange).toHaveBeenLastCalledWith(6);
    expect(onListingsChange.mock.lastCall![0].map((l: MarketListingEntry) => l._id)).toEqual(['L1', 'L2', 'L4', 'L5']);
    expect(toasts()).toEqual(['已将「Item 3」从市场下架。']);
  });

  it('on failure keeps the row, toasts, and refetches the first page', async () => {
    api.deleteMarketListing.mockRejectedValueOnce(new Error('500'));
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await click(within(row('Item 3')).getByLabelText('删除挂单'));
    expect(toasts()).toEqual(['删除挂单失败。']);
    expect(queries).toEqual([{ limit: 5, skip: 0, hc: true, ladder: false }]);
    expect(screen.queryByText('Item 3')).not.toBeNull();
    expect(countChip()).toBe('7');
  });
});

describe('editing', () => {
  async function startEdit(name: string) {
    await click(within(row(name)).getByRole('button', { name: /编辑/ }));
  }
  const note = () => screen.getByLabelText('价格备注') as HTMLInputElement;
  const price = () => screen.getByLabelText('HR 价格') as HTMLInputElement;
  const save = () => screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;

  it('prefills from the listing and disables Save once both fields are empty', async () => {
    server[0] = makeListing(1, { price: 'or offer', hr_price: 2 });
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await startEdit('Item 1');
    expect(note().value).toBe('or offer');
    expect(price().value).toBe('2');
    fireEvent.change(note(), { target: { value: '' } });
    fireEvent.change(price(), { target: { value: '' } });
    expect(save().disabled).toBe(true);
  });

  it('saving a note only clears the HR price and updates the row in place', async () => {
    server[0] = makeListing(1, { price: '', hr_price: 4 });
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await startEdit('Item 1');
    fireEvent.change(note(), { target: { value: 'pc' } });
    fireEvent.change(price(), { target: { value: '' } });
    fireEvent.submit(save().closest('form')!);
    await waitFor(() => expect(toasts()).toEqual(['挂单已更新！']));
    expect(api.updateMarketListing.mock.calls).toEqual([['L1', { price: 'pc', hr_price: 0 }]]);
    expect(api.updateItemByHash.mock.calls).toEqual([['h1', { price: 'pc', hr_price: 0 }]]);
    expect(screen.queryByLabelText('价格备注')).toBeNull();
    expect(within(row('Item 1')).queryByText('4 HR')).toBeNull();
    expect(within(row('Item 1')).queryByText('pc')).not.toBeNull();
  });

  it('saving a price sends it as a number alongside the note', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await startEdit('Item 2');
    fireEvent.change(price(), { target: { value: ' 1.5 ' } });
    fireEvent.submit(save().closest('form')!);
    await waitFor(() => expect(api.updateMarketListing).toHaveBeenCalled());
    expect(api.updateMarketListing.mock.calls[0]).toEqual(['L2', { hr_price: 1.5, price: '' }]);
    await screen.findByText('1.5 HR');
  });

  it('keeps the editor open and reports failure when the update fails', async () => {
    api.updateMarketListing.mockRejectedValueOnce(new Error('x'));
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await startEdit('Item 1');
    fireEvent.change(note(), { target: { value: 'pc' } });
    fireEvent.submit(save().closest('form')!);
    await waitFor(() => expect(toasts()).toEqual(['更新挂单失败。']));
    expect(screen.queryByLabelText('价格备注')).not.toBeNull();
  });

  it('Escape cancels editing without saving', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    await startEdit('Item 1');
    fireEvent.keyDown(note(), { key: 'Escape' });
    expect(screen.queryByLabelText('价格备注')).toBeNull();
    expect(api.updateMarketListing).not.toHaveBeenCalled();
  });
});

describe('search', () => {
  it('reports a search request failure instead of claiming there are no matches', async () => {
    renderTab({ initialListings: server.slice(0, 5), initialTotalCount: 7 });
    api.getMarketListings.mockRejectedValueOnce(new Error('offline'));
    fireEvent.change(screen.getByLabelText('搜索挂单'), { target: { value: 'Ruby Jewel' } });
    expect(await screen.findByText('搜索挂单失败，请稍后重试。')).not.toBeNull();
    expect(screen.queryByText('没有匹配结果')).toBeNull();
  });
  it('finds a listed jewel by its English name in the full market response', async () => {
    server[5].item.name = 'Ruby Jewel of Truth';
    server[5].item.base.name = 'Jewel';
    server[5].item.quality.name = 'Magic';
    renderTab({ initialListings: server.slice(0, 5), initialTotalCount: 7 });
    fireEvent.change(screen.getByLabelText('搜索挂单'), { target: { value: 'Ruby Jewel of Truth' } });
    expect(await screen.findByTitle('Ruby Jewel of Truth')).not.toBeNull();
    expect(queries.some((q) => q.limit === 1000 && q.skip === 0)).toBe(true);
  });
  const search = () => screen.getByLabelText('搜索挂单') as HTMLInputElement;

  it('searches across all listings (not just the loaded page) and updates the count', async () => {
    server.push(makeListing(8, { item: { ...makeListing(8).item, name: 'Griffon Eye' } }));
    renderTab({ initialListings: server, initialTotalCount: 8 });
    fireEvent.change(search(), { target: { value: 'griffon' } });
    await screen.findByText('Griffon Eye');
    expect(queries.at(-1)).toEqual({ limit: 1000, skip: 0, hc: true, ladder: false });
    expect(screen.queryByText('Item 1')).toBeNull();
    expect(countChip()).toBe('1');
  });

  it('shows a no-match state, and Escape restores the paged list', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    fireEvent.change(search(), { target: { value: 'zzzzzzzz' } });
    await screen.findByText('没有匹配结果');
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(search().value).toBe('');
    expect(screen.queryByText('Item 1')).not.toBeNull();
    expect(countChip()).toBe('7');
  });

  it('a failed search fetch reports the error without showing stale results', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    api.getMarketListings.mockRejectedValueOnce(new Error('x'));
    fireEvent.change(search(), { target: { value: 'Item 1' } });
    await screen.findByText('搜索挂单失败，请稍后重试。');
    expect(screen.queryByText('Item 1')).toBeNull();
    expect(screen.queryByText('没有匹配结果')).toBeNull();
  });

  it('removing a listing while searching drops it from the results', async () => {
    renderTab({ initialListings: server, initialTotalCount: 7 });
    fireEvent.change(search(), { target: { value: 'Item 6' } });
    await screen.findByText('Item 6');
    await click(within(row('Item 6')).getByLabelText('删除挂单'));
    expect(screen.queryByText('Item 6')).toBeNull();
  });
});

it('toggles the stats panel per listing', async () => {
  renderTab({ initialListings: server, initialTotalCount: 7 });
  const toggle = within(row('Item 1')).getByRole('button', { name: /显示属性/ });
  await click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByText('+1% 快速施法速度 (FCR)')).not.toBeNull();
  expect(screen.queryByText('+2% 快速施法速度 (FCR)')).toBeNull();
  await click(toggle);
  expect(screen.queryByText('+1% 快速施法速度 (FCR)')).toBeNull();
});
