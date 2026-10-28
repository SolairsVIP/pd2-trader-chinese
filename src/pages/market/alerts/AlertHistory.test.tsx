// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AlertHistory } from './AlertHistory';
import { claimAlertPopup, closeAlertHistory } from './alert-history';
import { publishMarketAlerts } from './alert-events';
import { listMarketAlerts, type MarketAlert } from './saved-search-api';
vi.mock('./saved-search-api', () => ({ listMarketAlerts: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const alert = (id: string): MarketAlert => ({ id, listingId: id, matchedAt: new Date().toISOString(), savedSearchId: 'search', savedSearchName: '测试', listing: { id, name: `物品${id}`, baseName: null, price: '1', hrPrice: null, seller: '卖家' } as MarketAlert['listing'] });
it('merges live alerts arriving during the history request and opens a selected listing', async () => {
  let resolve!: (value: { items: MarketAlert[] }) => void;
  vi.mocked(listMarketAlerts).mockReturnValue(new Promise((done) => { resolve = done; }));
  const onView = vi.fn();
  render(<AlertHistory token="token" onView={onView} />);
  act(() => publishMarketAlerts([alert('live')]));
  await act(async () => resolve({ items: [alert('old')] }));
  expect(screen.getByText('物品live — 1')).toBeTruthy();
  expect(screen.getByText('物品old — 1')).toBeTruthy();
  fireEvent.click(screen.getByText('物品live — 1'));
  expect(onView).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'live' }));
});

it('removes an alert from the open panel when its 30 minutes expire', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(listMarketAlerts).mockResolvedValue({ items: [alert('expiry')] });
    render(<AlertHistory token="token" onView={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText('物品expiry — 1')).toBeTruthy();
    act(() => vi.advanceTimersByTime(30 * 60 * 1000));
    expect(screen.queryByText('物品expiry — 1')).toBeNull();
  } finally { vi.useRealTimers(); }
});

it('allows another popup when the market history is closed', async () => {
  closeAlertHistory();
  vi.mocked(listMarketAlerts).mockResolvedValue({ items: [] });
  const view = render(<AlertHistory token="token" visible onView={vi.fn()} />);
  await act(async () => {});
  expect(claimAlertPopup()).toBe(true);
  expect(claimAlertPopup()).toBe(false);
  view.rerender(<AlertHistory token="token" visible={false} onView={vi.fn()} />);
  expect(claimAlertPopup()).toBe(true);
});

it('does not rearm merely by reopening the history panel', async () => {
  closeAlertHistory();
  vi.mocked(listMarketAlerts).mockResolvedValue({ items: [] });
  const view = render(<AlertHistory token="token" visible={false} onView={vi.fn()} />);
  await act(async () => {});
  expect(claimAlertPopup()).toBe(true);
  view.rerender(<AlertHistory token="token" visible onView={vi.fn()} />);
  expect(claimAlertPopup()).toBe(false);
});

it('clears history and keeps it cleared after refresh while showing later alerts', async () => {
  vi.useFakeTimers();
  try {
    const old = alert('clear-old');
    vi.mocked(listMarketAlerts).mockResolvedValue({ items: [old] });
    render(<AlertHistory token="clear-token" accountId="clear-account" onView={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '全部清除' }));
    expect(screen.queryByText('物品clear-old — 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    await act(async () => {});
    expect(screen.queryByText('物品clear-old — 1')).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    act(() => publishMarketAlerts([alert('clear-new')]));
    expect(screen.getByText('物品clear-new — 1')).toBeTruthy();
  } finally { vi.useRealTimers(); }
});

it('keeps cleared items hidden after reopening and an in-flight response', async () => {
  const old = alert('pending-old');
  let finish!: (value: { items: MarketAlert[] }) => void;
  vi.mocked(listMarketAlerts).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const view = render(<AlertHistory token="pending-token" accountId="pending-account" onView={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '全部清除' }));
  await act(async () => finish({ items: [old] }));
  expect(screen.queryByText('物品pending-old — 1')).toBeNull();
  view.unmount();
  vi.mocked(listMarketAlerts).mockResolvedValue({ items: [old] });
  render(<AlertHistory token="pending-token" accountId="pending-account" onView={vi.fn()} />);
  await act(async () => {});
  expect(screen.queryByText('物品pending-old — 1')).toBeNull();
});
