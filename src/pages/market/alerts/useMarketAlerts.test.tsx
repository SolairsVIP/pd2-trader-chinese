// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exists, readTextFile } from '@/lib/browser-fs';
import { playNotificationSound } from '@/hooks/useSocketNotifications';
import { showToast } from '@/overlay';
import { dismissMarketAlertSummary, showMarketAlertToast } from '@/overlay/toast';
import type { SavedSearch } from '@/pages/market/lib/types';
import { marketStoreActions, resetMarketPrefs } from '@/pages/market/store/useMarketStore';
import { ALERT_RETENTION_MS, clearLiveAlerts, liveAlertHistory } from './alert-history';
import { listMarketAlerts, listSavedSearches, openAlertStream, updateSavedSearch, type MarketAlert } from './saved-search-api';
import type * as SavedSearchApi from './saved-search-api';
import { useMarketAlerts } from './useMarketAlerts';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  height: 720,
}));

vi.mock('@/hooks/useOptions', () => ({ useOptions: () => ({ settings: h.settings, isLoading: false }) }));
vi.mock('@/hooks/useSocketNotifications', () => ({ playNotificationSound: vi.fn() }));
vi.mock('@/overlay', () => ({
  showToast: vi.fn(),
  useOverlay: () => ({ gameRect: { x: 0, y: 0, width: 1280, height: h.height }, gameFocused: true }),
}));
vi.mock('@/overlay/toast', () => ({ showMarketAlertToast: vi.fn(), dismissMarketAlertSummary: vi.fn() }));
vi.mock('@/lib/browser-fs', () => ({
  BaseDirectory: { AppConfig: 13 },
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(async () => {}),
}));
vi.mock('./saved-search-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SavedSearchApi>()),
  listSavedSearches: vi.fn(),
  listMarketAlerts: vi.fn(async () => ({ items: [] })),
  openAlertStream: vi.fn(),
  updateSavedSearch: vi.fn(),
}));

const search = (id: string, alert: boolean): SavedSearch => ({
  id,
  name: id,
  filters: { source: 'live', itemName: 'Harlequin Crest', stats: [] } as unknown as SavedSearch['filters'],
  alert,
  createdAt: '2026-10-21T00:00:00Z',
});

const alert: MarketAlert = {
  id: 'al1',
  savedSearchId: 's1',
  savedSearchName: 'Cheap Shako',
  listingId: 'l1',
  matchedAt: new Date().toISOString(),
  listing: {
    id: 'l1',
    isLadder: true,
    isHardcore: false,
    name: 'Harlequin Crest',
    baseName: 'Shako',
    baseCode: 'uap',
    typeCode: 'helm',
    quality: 'Unique',
    price: '2 ist',
    hrPrice: 0.5,
    bumpedAt: null,
    seller: 'Gheed',
    status: 'active',
    soldHr: null,
  },
};

/** An open stream that sends `text` and stays open. */
const stream = (text: string) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
      },
    }),
  );
const HELLO = 'event: hello\ndata: {"serverTime":"2026-10-21T08:00:00Z"}\n\n';
const ALERT = `event: market.alert\ndata: ${JSON.stringify(alert)}\n\n`;

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  resetMarketPrefs();
  vi.mocked(exists).mockResolvedValue(false);
  vi.mocked(readTextFile).mockReset();
  vi.mocked(showToast).mockClear();
  vi.mocked(showMarketAlertToast).mockReset().mockImplementation((_payload, onClose) => {
    const timeout = setTimeout(onClose, 10_000);
    return vi.fn(() => clearTimeout(timeout));
  });
  vi.mocked(dismissMarketAlertSummary).mockClear();
  vi.mocked(playNotificationSound).mockClear();
  vi.mocked(openAlertStream).mockReset();
  vi.mocked(updateSavedSearch).mockReset();
  vi.mocked(listMarketAlerts).mockReset().mockResolvedValue({ items: [] });
  vi.mocked(listSavedSearches).mockReset();
  h.settings = { pd2Token: 'tok' };
  h.height = 720;
  window.innerHeight = 1080;
  clearLiveAlerts('tok');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMarketAlerts', () => {
  it('syncs the saved searches and pops a toast with the alert sound for each new match', async () => {
    h.settings = { pd2Token: 'tok', marketAlertVolume: 40 };
    vi.mocked(listSavedSearches).mockResolvedValue({
      items: [search('s1', true)],
      limits: { maxSearches: 25, maxAlerting: 10 },
    });
    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO + ALERT + ALERT));
    renderHook(() => useMarketAlerts());
    await settle();
    await settle();

    expect(listSavedSearches).toHaveBeenCalledWith('tok');
    expect(openAlertStream).toHaveBeenCalledWith('tok', expect.any(AbortSignal));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][0]).toMatchObject({
      description: 'Cheap Shako：Harlequin Crest — 0.5 HR',
      id: expect.stringMatching(/^market-alert-summary-/),
      action: { data: { tab: 'alerts' } },
    });
    expect(playNotificationSound).toHaveBeenCalledWith(40);
  });

  it('每 30 秒汇总尚未弹窗的新匹配，旧记录不会重复提醒', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    renderHook(() => useMarketAlerts());
    await settle();
    const push = async (item: MarketAlert) => {
      await act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify(item)}\n\n`)); });
    };
    await push(alert);
    expect(showToast).toHaveBeenCalledTimes(1);
    await push({ ...alert, id: 'al2' });
    await push({ ...alert, id: 'al3' });
    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(showToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showToast).mock.calls[1][0]).toEqual(expect.objectContaining({ description: expect.stringContaining('新增 2 条') }));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('实时模式下每条新匹配都有独立弹窗，重复事件不会重复提醒', async () => {
    h.settings = { pd2Token: 'tok', marketAlertRealtime: true };
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO + ALERT + `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: 'al2' })}\n\n` + ALERT));
    renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showMarketAlertToast).mock.calls.map(([toast]) => toast.id)).toEqual(['market-alert-al1', 'market-alert-al2']);
  });

  it('切换实时模式时立即显示等待汇总的提醒且不重连', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    await act(async () => { writer.enqueue(new TextEncoder().encode(ALERT + `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: 'al2' })}\n\n`)); });
    expect(showToast).toHaveBeenCalledTimes(1);
    h.settings = { ...h.settings, marketAlertRealtime: true };
    rerender(); await settle();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showMarketAlertToast).toHaveBeenCalledWith(expect.objectContaining({ id: 'market-alert-al2' }), expect.any(Function));
    expect(openAlertStream).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('切回 30 秒模式后恢复汇总，不重连', async () => {
    h.settings = { pd2Token: 'tok', marketAlertRealtime: true };
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    const push = async (id: string) => act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify({ ...alert, id })}\n\n`)); });
    await push('al1');
    h.settings = { ...h.settings, marketAlertRealtime: false }; rerender();
    await push('al2'); await push('al3');
    expect(showToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showToast).mock.calls[1][0]).toMatchObject({ id: expect.stringMatching(/^market-alert-summary-/) });
    expect(openAlertStream).toHaveBeenCalledTimes(1);
  });

  it('立即记录全部提醒，并在空间足够时最多同时显示三条，其余等待关闭后显示', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    renderHook(() => useMarketAlerts());
    await settle();
    const burst = Array.from({ length: 5 }, (_, i) => ({ ...alert, id: `burst-${i}` }));
    await act(async () => { writer.enqueue(new TextEncoder().encode(burst.map((item) => `event: market.alert\ndata: ${JSON.stringify(item)}\n\n`).join(''))); });
    expect(new Set(liveAlertHistory('tok').map((item) => item.id))).toEqual(new Set(burst.map((item) => item.id)));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    expect(showToast).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(vi.mocked(showMarketAlertToast).mock.calls.map(([toast]) => toast.id)).toEqual(burst.map((item) => `market-alert-${item.id}`));
    expect(playNotificationSound).toHaveBeenCalledTimes(5);
  });

  it('视口缩小时把超出容量的提醒重新排队，扩大后继续显示', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValue(stream(Array.from({ length: 3 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `resize-${i}` })}\n\n`).join('')));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    h.height = 150; rerender(); await settle();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(4);
    h.height = 720; rerender(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(5);
    expect(playNotificationSound).toHaveBeenCalledTimes(3);
    expect(liveAlertHistory('tok').filter((item) => item.id.startsWith('resize-'))).toHaveLength(3);
  });

  it('切换回实时后仍会在缩小时重排未完成的弹窗，且不重复播放声音', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValue(stream(Array.from({ length: 3 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `switch-resize-${i}` })}\n\n`).join('')));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    h.settings = { ...h.settings, marketAlertRealtime: false }; rerender(); await settle();
    h.settings = { ...h.settings, marketAlertRealtime: true }; rerender(); await settle();
    h.height = 150; rerender(); await settle();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(4);
    h.height = 720; rerender(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(5);
    expect(playNotificationSound).toHaveBeenCalledTimes(3);
  });

  it('汇总模式下缩容时把未完成的实时弹窗合并入限频汇总，不再次响铃', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    const push = async (id: string) => act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify({ ...alert, id })}\n\n`)); });
    await push('before-switch');
    h.settings = { ...h.settings, marketAlertRealtime: true }; rerender(); await settle();
    await push('active-1'); await push('active-2'); await push('active-3');
    expect(playNotificationSound).toHaveBeenCalledTimes(4);
    h.settings = { ...h.settings, marketAlertRealtime: false }; rerender(); await settle();
    h.height = 150; rerender(); await settle();
    expect(showToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showToast).mock.calls[1][0]).toMatchObject({ description: expect.stringContaining('新增 2 条') });
    expect(playNotificationSound).toHaveBeenCalledTimes(4);
  });

  it('切回汇总模式时合并未展示的提醒，再切回实时模式不会重放', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValue(stream(Array.from({ length: 5 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `mode-${i}` })}\n\n`).join('')));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    h.settings = { ...h.settings, marketAlertRealtime: false }; rerender(); await settle();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('新增 2 条') }));
    h.settings = { ...h.settings, marketAlertRealtime: true }; rerender(); await settle();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
  });

  it('清除历史后不会弹出排队中的旧提醒，也不会影响后来的新提醒', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    const push = async (id: string) => act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify({ ...alert, id, matchedAt: new Date().toISOString() })}\n\n`)); });
    for (let i = 0; i < 5; i++) await push(`clear-${i}`);
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    act(() => clearLiveAlerts('tok'));
    for (const result of vi.mocked(showMarketAlertToast).mock.results) expect(result.value).toHaveBeenCalledTimes(1);
    // A subsequent shrink must not requeue popups that belonged to the cleared history.
    h.height = 150; rerender(); await settle();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    await push('clear-new');
    expect(showMarketAlertToast).toHaveBeenCalledTimes(4);
    expect(vi.mocked(showMarketAlertToast).mock.calls[3][0]).toMatchObject({ id: 'market-alert-clear-new' });
  });

  it('清除历史时也清空等待 30 秒汇总的旧提醒', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    renderHook(() => useMarketAlerts());
    await settle();
    const push = async (id: string) => act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify({ ...alert, id, matchedAt: new Date().toISOString() })}\n\n`)); });
    await push('summary-1'); await push('summary-2');
    expect(showToast).toHaveBeenCalledTimes(1);
    const oldId = (vi.mocked(showToast).mock.calls[0][0] as { id: string }).id;
    act(() => clearLiveAlerts('tok'));
    expect(dismissMarketAlertSummary).toHaveBeenCalledWith(oldId);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(showToast).toHaveBeenCalledTimes(1);
    await push('summary-new');
    expect(showToast).toHaveBeenCalledTimes(2);
    expect((vi.mocked(showToast).mock.calls[1][0] as { id: string }).id).not.toBe(oldId);
  });

  it('清除历史及快速切换模式都不会重置 30 秒汇总限频', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream).mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(c) { writer = c; } })));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    const push = async (id: string) => act(async () => { writer.enqueue(new TextEncoder().encode(`event: market.alert\ndata: ${JSON.stringify({ ...alert, id, matchedAt: new Date().toISOString() })}\n\n`)); });
    await push('rate-1');
    act(() => clearLiveAlerts('tok'));
    await act(() => vi.advanceTimersByTimeAsync(1));
    await push('rate-2');
    expect(showToast).toHaveBeenCalledTimes(1);
    h.settings = { ...h.settings, marketAlertRealtime: true }; rerender(); await settle();
    h.settings = { ...h.settings, marketAlertRealtime: false }; rerender(); await settle();
    await push('rate-3');
    expect(showToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(29_998));
    expect(showToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('实时弹窗即使悬停也在其记录的 30 分钟期限到达时关闭，空位显示后续提醒', async () => {
    h.settings.marketAlertRealtime = true;
    h.height = 150;
    vi.mocked(showMarketAlertToast).mockImplementation(() => vi.fn());
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    const expiring = { ...alert, id: 'visible-expiring', matchedAt: new Date(Date.now() - ALERT_RETENTION_MS + 1_000).toISOString() };
    vi.mocked(openAlertStream).mockResolvedValue(stream([expiring, { ...alert, id: 'next-fresh' }].map((item) => `event: market.alert\ndata: ${JSON.stringify(item)}\n\n`).join('')));
    renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(vi.mocked(showMarketAlertToast).mock.results[0].value).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showMarketAlertToast).mock.calls[1][0]).toMatchObject({ id: 'market-alert-next-fresh' });
  });

  it('不再显示超过 30 分钟有效期的排队提醒', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    const items = [0, 1, 2].map((i) => ({ ...alert, id: `fresh-${i}` }));
    items.push({ ...alert, id: 'expires-queued', matchedAt: new Date(Date.now() - ALERT_RETENTION_MS + 5_000).toISOString() });
    vi.mocked(openAlertStream).mockResolvedValue(stream(items.map((item) => `event: market.alert\ndata: ${JSON.stringify(item)}\n\n`).join('')));
    renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    expect(liveAlertHistory('tok')).toHaveLength(4);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    expect(liveAlertHistory('tok')).toHaveLength(3);
  });

  it('停止监听时清理弹窗和队列，即使旧关闭回调触发也不重放', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValue(stream(Array.from({ length: 5 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `stop-${i}` })}\n\n`).join('')));
    const view = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    const staleCallbacks = vi.mocked(showMarketAlertToast).mock.calls.map(([, onClose]) => onClose);
    view.unmount();
    for (const result of vi.mocked(showMarketAlertToast).mock.results) expect(result.value).toHaveBeenCalledTimes(1);
    act(() => staleCallbacks.forEach((callback) => callback()));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
  });

  it('关闭最后一条规则失败回滚后继续展示此前未显示的排队提醒', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream)
      .mockResolvedValueOnce(stream(Array.from({ length: 5 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `rollback-${i}` })}\n\n`).join('')))
      .mockResolvedValueOnce(stream(''));
    let fail!: (error: Error) => void;
    vi.mocked(updateSavedSearch).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    act(() => { marketStoreActions.setSearchAlert('s1', false); });
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    await act(async () => fail(new Error('offline')));
    await settle();
    expect(vi.mocked(showMarketAlertToast).mock.calls.slice(3).map(([toast]) => toast.id)).toEqual(['market-alert-rollback-0', 'market-alert-rollback-1', 'market-alert-rollback-2']);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(vi.mocked(showMarketAlertToast).mock.calls.slice(6).map(([toast]) => toast.id)).toEqual(['market-alert-rollback-3', 'market-alert-rollback-4']);
    expect(playNotificationSound).toHaveBeenCalledTimes(5);
  });

  it('缩容导致重排后临时停止，恢复监听不会丢弃这些提醒或重复响铃', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream)
      .mockResolvedValueOnce(stream(Array.from({ length: 3 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `resume-resize-${i}` })}\n\n`).join('')))
      .mockResolvedValueOnce(stream(''));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    h.height = 150; rerender(); await settle();
    act(() => marketStoreActions.setAlertsEnabled(false)); await settle();
    h.height = 720; rerender(); await settle();
    act(() => marketStoreActions.setAlertsEnabled(true)); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(6);
    expect(playNotificationSound).toHaveBeenCalledTimes(3);
  });

  it('主动关闭期间暂停排队，重新开启后恢复未展示项；清空或切账号会丢弃旧队列', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let resumedWriter!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(openAlertStream)
      .mockResolvedValueOnce(stream(Array.from({ length: 5 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `paused-${i}` })}\n\n`).join('')))
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(c) { resumedWriter = c; } })))
      .mockResolvedValueOnce(stream(''));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    act(() => marketStoreActions.setAlertsEnabled(false)); await settle();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(3);
    act(() => marketStoreActions.setAlertsEnabled(true)); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(6);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(showMarketAlertToast).toHaveBeenCalledTimes(8);
    // Stop with a new backlog, then clear while stopped.
    await act(async () => { resumedWriter.enqueue(new TextEncoder().encode(Array.from({ length: 3 }, (_, i) => `event: market.alert\ndata: ${JSON.stringify({ ...alert, id: `paused-new-${i}` })}\n\n`).join(''))); });
    expect(showMarketAlertToast).toHaveBeenCalledTimes(9);
    act(() => marketStoreActions.setAlertsEnabled(false)); await settle();
    act(() => clearLiveAlerts('tok'));
    act(() => marketStoreActions.setAlertsEnabled(true)); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(9);
    // A new account must not reuse the old account's queued or deduplication state.
    h.settings = { ...h.settings, pd2Token: 'tok2' }; rerender(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(9);
  });

  it('切账号后关闭旧汇总弹窗，不恢复旧队列，并允许新账号的相同提醒 ID', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    const burst = Array.from({ length: 5 }, (_, i) => ({ ...alert, id: `account-${i}` }));
    vi.mocked(openAlertStream)
      .mockResolvedValueOnce(stream(burst.map((item) => `event: market.alert\ndata: ${JSON.stringify(item)}\n\n`).join('')))
      .mockResolvedValueOnce(stream(`event: market.alert\ndata: ${JSON.stringify(burst[0])}\n\n`));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    act(() => marketStoreActions.setAlertsEnabled(false)); await settle();
    h.settings = { ...h.settings, pd2Token: 'tok2' }; rerender(); await settle();
    act(() => marketStoreActions.setAlertsEnabled(true)); await settle(); await settle();
    expect(showMarketAlertToast).toHaveBeenCalledTimes(4);
    expect(vi.mocked(showMarketAlertToast).mock.calls[3][0]).toMatchObject({ id: 'market-alert-account-0' });
  });

  it('切账号时取消属于旧账号的汇总弹窗', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    vi.mocked(openAlertStream).mockResolvedValueOnce(stream(ALERT)).mockResolvedValueOnce(stream(''));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    const oldId = (vi.mocked(showToast).mock.calls[0][0] as { id: string }).id;
    h.settings = { ...h.settings, pd2Token: 'tok2' }; rerender(); await settle();
    expect(dismissMarketAlertSummary).toHaveBeenCalledWith(oldId);
  });

  it('停止监听后忽略仍在途的补拉响应', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let finish!: (value: { items: MarketAlert[] }) => void;
    vi.mocked(listMarketAlerts).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO + HELLO));
    const view = renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(listMarketAlerts).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => finish({ items: [{ ...alert, id: 'late-catchup' }] }));
    expect(showMarketAlertToast).not.toHaveBeenCalled();
    expect(liveAlertHistory('tok')).toEqual([]);
  });

  it('清除历史后忽略清除前仍在途的补拉结果', async () => {
    h.settings.marketAlertRealtime = true;
    vi.mocked(listSavedSearches).mockResolvedValue({ items: [search('s1', true)], limits: { maxSearches: 25, maxAlerting: 10 } });
    let finish!: (value: { items: MarketAlert[] }) => void;
    vi.mocked(listMarketAlerts).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO + HELLO));
    renderHook(() => useMarketAlerts());
    await settle(); await settle();
    expect(listMarketAlerts).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    act(() => clearLiveAlerts('tok'));
    await act(async () => finish({ items: [{ ...alert, id: 'cleared-catchup' }] }));
    expect(showMarketAlertToast).not.toHaveBeenCalled();
    expect(liveAlertHistory('tok')).toEqual([]);
  });

  it('stays quiet when the alert sound is off', async () => {
    h.settings = { pd2Token: 'tok', marketAlertSoundEnabled: false };
    vi.mocked(listSavedSearches).mockResolvedValue({
      items: [search('s1', true)],
      limits: { maxSearches: 25, maxAlerting: 10 },
    });
    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO + ALERT));
    renderHook(() => useMarketAlerts());
    await settle();
    await settle();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('opens no stream without a watched search, with alerts off, or signed out', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({
      items: [search('s1', false)],
      limits: { maxSearches: 25, maxAlerting: 10 },
    });
    renderHook(() => useMarketAlerts());
    await settle();
    expect(openAlertStream).not.toHaveBeenCalled();
    cleanup();

    resetMarketPrefs();
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue(JSON.stringify({ alertsEnabled: false }));
    vi.mocked(listSavedSearches).mockResolvedValue({
      items: [search('s1', true)],
      limits: { maxSearches: 25, maxAlerting: 10 },
    });
    renderHook(() => useMarketAlerts());
    await settle();
    expect(openAlertStream).not.toHaveBeenCalled();
    cleanup();

    resetMarketPrefs();
    h.settings = {};
    renderHook(() => useMarketAlerts());
    await settle();
    expect(listSavedSearches).toHaveBeenCalledTimes(2);
    expect(openAlertStream).not.toHaveBeenCalled();
  });

  it('stops after a 401 until the token changes', async () => {
    vi.mocked(listSavedSearches).mockResolvedValue({
      items: [search('s1', true)],
      limits: { maxSearches: 25, maxAlerting: 10 },
    });
    vi.mocked(openAlertStream).mockRejectedValue(Object.assign(new Error('expired'), { status: 401 }));
    const { rerender } = renderHook(() => useMarketAlerts());
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(openAlertStream).toHaveBeenCalledTimes(1);

    vi.mocked(openAlertStream).mockResolvedValue(stream(HELLO));
    h.settings = { pd2Token: 'tok2' };
    rerender();
    await settle();
    await settle();
    expect(openAlertStream).toHaveBeenLastCalledWith('tok2', expect.any(AbortSignal));
  });
});
