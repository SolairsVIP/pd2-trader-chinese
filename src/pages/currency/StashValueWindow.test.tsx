// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { useNetWorth, type NetWorthContextValue } from '@/hooks/useNetWorth';
import { useOptions } from '@/hooks/useOptions';
import { useWealthRank } from '@/hooks/useWealthRank';
import { usePanel, useOverlay, type OverlayApi, type PanelContextValue, type PanelPayloads } from '@/overlay';
import {
  getPoints,
  type NetWorthCategory,
  type NetWorthPoint,
  type RaresSummary,
  type SnapshotResponse,
  type Valuation,
  type ValuationLine,
} from '@/lib/networth-api';
import type * as NetWorthApi from '@/lib/networth-api';
import type { RareAppraisal } from '@/lib/rare-appraisal-api';
import { StashValueWindow } from './StashValueWindow';

vi.mock('@/hooks/useNetWorth', () => ({ useNetWorth: vi.fn() }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/hooks/useWealthRank', () => ({ useWealthRank: vi.fn() }));
vi.mock('@/overlay', () => ({ usePanel: vi.fn(), useOverlay: vi.fn() }));
vi.mock('@/lib/networth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof NetWorthApi>()),
  getPoints: vi.fn(),
}));
vi.mock('../price-check/hooks/useEconomyData', () => ({
  useEconomyData: () => ({
    loading: false,
    calculatedRuneValues: [],
    selectedRuneBreakdown: null,
    selectedRuneCombinations: [],
    setSelectedRuneBreakdown: () => {},
  }),
}));
vi.mock('../price-check/components/RunePricePopover', () => ({
  RunePricePopover: () => <button type="button">Rune exchange</button>,
}));
// History has its own tests; this stub exposes what the window passes down
vi.mock('./components/HistoryTab', () => ({
  HistoryTab: (props: {
    seasonPoints: NetWorthPoint[] | null;
    refreshKey: string | null;
    currentSeasonId: string | null;
    onHistoryChanged: () => void;
  }) => (
    <div data-testid="history">
      points={props.seasonPoints === null ? 'null' : props.seasonPoints.length} refreshKey={props.refreshKey} season=
      {props.currentSeasonId}
      <button type="button"
        onClick={props.onHistoryChanged}>
        history changed
      </button>
    </div>
  ),
}));

const NOW = new Date('2026-10-18T12:00:00.000Z');
const OWNER = { account: 'Hammerdin', isLadder: true, isHardcore: false };
const CATEGORIES: Record<NetWorthCategory, number> = {
  runes: 0,
  currency: 0,
  ubers: 0,
  gems: 0,
  mats: 0,
  uniques: 0,
  sets: 0,
  other: 0,
};

function line(key: string, category: NetWorthCategory, value: number): ValuationLine {
  return {
    key,
    name: key,
    category,
    qty: 1,
    unitPrice: value,
    value,
    confidence: 'ok',
    sampleCount: 10,
    priceChange7dPercent: null,
    tab: null,
    iconPath: null,
  };
}

function valuation(overrides: Partial<Valuation> = {}): Valuation {
  return {
    account: OWNER.account,
    isLadder: true,
    isHardcore: false,
    seasonId: 's12',
    takenAt: '2026-10-18T11:59:00.000Z',
    priceDay: '2026-10-18',
    priceSource: 'market',
    totalHr: 12.5,
    uncertainHr: 0,
    unpricedCount: 0,
    gold: 1500,
    byCategory: { ...CATEGORIES, runes: 6, gems: 2, mats: 1, uniques: 3.5 },
    byTab: {},
    lines: [
      line('Ber Rune', 'runes', 6),
      line('Perfect Ruby', 'gems', 2),
      line('Wirt Leg', 'mats', 1),
      line('Shako', 'uniques', 3.5),
    ],
    ...overrides,
  };
}

function snapshot(overrides: Partial<SnapshotResponse> = {}): SnapshotResponse {
  return {
    valuation: valuation(),
    snapshotId: 'snap',
    deduped: false,
    delta: { sincePrevious: 1.25, previousTakenAt: null },
    ...overrides,
  };
}

function point(takenAt: string, totalHr: number): NetWorthPoint {
  return {
    snapshotId: takenAt,
    takenAt,
    lastConfirmedAt: takenAt,
    trigger: 'interval',
    priceDay: takenAt.slice(0, 10),
    totalHr,
    uncertainHr: 0,
    unpricedCount: 0,
    gold: 0,
    byCategory: { ...CATEGORIES },
    hasHoldings: true,
  };
}

let netWorth: NetWorthContextValue;
let settings: { pd2Token?: string };
let panel: { payload: PanelPayloads['currency']; payloadVersion: number };
let gameFocused: boolean;
let close: Mock;
let openPanel: Mock;

/** openPanel('currency', payload) again: new payload, bumped payloadVersion. */
function reopen(payload: PanelPayloads['currency']) {
  panel = { payload, payloadVersion: panel.payloadVersion + 1 };
}

function setNetWorth(overrides: Partial<NetWorthContextValue>) {
  netWorth = { ...netWorth, ...overrides };
}

function renderWindow() {
  return render(<StashValueWindow />);
}

/** Text of the delta pills in the header ("+1.25 HR (较上次)"). */
function deltaPills(): string[] {
  return [...document.querySelectorAll('span.rounded-full')]
    .map((el) => el.textContent ?? '')
    .filter((text) => /\((较上次|24 小时|本赛季)\)$/.test(text));
}

function openTab(name: string | RegExp) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });
}

// happy-dom's Web Animations reject on cancel; framer-motion animations add nothing to these assertions
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  settings = { pd2Token: 'tok' };
  netWorth = {
    owner: OWNER,
    trackingEnabled: true,
    latest: snapshot(),
    status: 'ok',
    error: null,
    lastSnapshotAt: NOW.getTime() - 30_000,
    currentSession: null,
    seasons: [
      { id: 's11', label: 'Season 11', startDate: '2026-06-01', endDate: '2026-10-15' },
      { id: 's12', label: 'Season 12', startDate: '2026-10-15', endDate: null },
    ],
    currentSeasonId: 's12',
    takeSnapshot: vi.fn(async () => null),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    openNetWorth: vi.fn(),
  };
  vi.mocked(useNetWorth).mockImplementation(() => netWorth);
  vi.mocked(useOptions).mockImplementation(() => ({ settings }) as never);
  vi.mocked(useWealthRank).mockReturnValue(null);
  panel = { payload: undefined, payloadVersion: 1 };
  gameFocused = true;
  close = vi.fn();
  openPanel = vi.fn();
  vi.mocked(usePanel).mockImplementation(() => ({ ...panel, close }) as unknown as PanelContextValue<'currency'>);
  vi.mocked(useOverlay).mockImplementation(() => ({ gameFocused, openPanel }) as unknown as OverlayApi);
  vi.mocked(getPoints).mockResolvedValue({ points: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StashValueWindow signed out', () => {
  it('offers sign-in when there is no PD2 token', () => {
    settings = {};
    setNetWorth({ status: 'signed-out', owner: null, latest: null });
    renderWindow();
    expect(screen.getByText('登录 PD2 账号以估算仓库价值')).not.toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(openPanel.mock.calls).toEqual([['signIn']]);
  });

  it('asks to pick an account when signed in without one', () => {
    setNetWorth({ status: 'signed-out', owner: null, latest: null });
    renderWindow();
    expect(screen.getByText('请在设置中选择 PD2 账号以估算仓库价值')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull();
  });
});

describe('StashValueWindow header', () => {
  it('shows the total, gold, price day and owner', async () => {
    renderWindow();
    expect(screen.getByText('12.50')).not.toBeNull();
    expect(screen.getByText(`${(1500).toLocaleString()} 金币`)).not.toBeNull();
    expect(screen.getByText('价格数据：2026-10-18')).not.toBeNull();
    expect(screen.getByText('Hammerdin')).not.toBeNull();
    expect(screen.getByText('天梯 · 普通模式')).not.toBeNull();
    expect(screen.getByText('Season 12')).not.toBeNull();
    expect(screen.queryByText(/当前没有非天梯行情数据/)).toBeNull();
    await act(async () => {});
  });

  it('labels non-ladder hardcore owners and warns about ladder-price fallback', async () => {
    setNetWorth({
      owner: { ...OWNER, isLadder: false, isHardcore: true },
      latest: snapshot({ valuation: valuation({ priceSource: 'ladder-fallback', seasonId: 's11' }) }),
    });
    renderWindow();
    expect(screen.getByText('非天梯 · 专家模式')).not.toBeNull();
    expect(screen.getByText('Season 11')).not.toBeNull();
    expect(screen.getByText('当前没有非天梯行情数据，已使用天梯价格估算')).not.toBeNull();
    await act(async () => {});
  });

  it('shows only the last-snapshot delta until season points load', async () => {
    vi.mocked(getPoints).mockReturnValue(Promise.withResolvers<{ points: NetWorthPoint[] }>().promise);
    renderWindow();
    expect(deltaPills()).toEqual(['+1.25 HR (较上次)']);
    await act(async () => {});
  });

  it('shows a dash when there is no previous snapshot', async () => {
    setNetWorth({ latest: snapshot({ delta: { sincePrevious: null, previousTakenAt: null } }) });
    vi.mocked(getPoints).mockReturnValue(Promise.withResolvers<{ points: NetWorthPoint[] }>().promise);
    renderWindow();
    expect(deltaPills()).toEqual(['— (较上次)']);
    await act(async () => {});
  });

  it('measures 24h against the last point at least a day old and season against the first point', async () => {
    vi.mocked(getPoints).mockResolvedValue({
      points: [
        point('2026-10-15T00:00:00.000Z', 4),
        point('2026-10-17T11:00:00.000Z', 10),
        point('2026-10-17T13:00:00.000Z', 11),
        point('2026-10-18T11:00:00.000Z', 12),
      ],
    });
    renderWindow();
    await waitFor(() => expect(deltaPills()).toHaveLength(3));
    expect(deltaPills()).toEqual(['+1.25 HR (较上次)', '+2.50 HR (24 小时)', '+8.50 HR (本赛季)']);
    expect(vi.mocked(getPoints).mock.calls[0]).toEqual(['tok', OWNER, { seasonId: 's12', resolution: 'hour' }]);
  });

  it('falls back to the first point for 24h when the season is younger than a day', async () => {
    vi.mocked(getPoints).mockResolvedValue({
      points: [point('2026-10-18T01:00:00.000Z', 14), point('2026-10-18T11:00:00.000Z', 13)],
    });
    renderWindow();
    await waitFor(() => expect(deltaPills()).toHaveLength(3));
    expect(deltaPills().slice(1)).toEqual(['−1.50 HR (24 小时)', '−1.50 HR (本赛季)']);
  });

  it('does not load season points while tracking is off', async () => {
    setNetWorth({ trackingEnabled: false });
    renderWindow();
    await act(async () => {});
    expect(getPoints).not.toHaveBeenCalled();
    expect(deltaPills()).toEqual(['+1.25 HR (较上次)']);
  });

  it('shows the wealth rank when ranked', async () => {
    vi.mocked(useWealthRank).mockReturnValue('#41 Wealth · Top 7%');
    renderWindow();
    expect(screen.getByText('#41 Wealth · Top 7%')).not.toBeNull();
    await act(async () => {});
  });

  it('re-values on Refresh and disables it while loading', async () => {
    const { rerender } = renderWindow();
    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));
    expect(vi.mocked(netWorth.takeSnapshot).mock.calls).toEqual([['manual']]);

    setNetWorth({ status: 'loading' });
    rerender(<StashValueWindow />);
    const button = screen.getByRole('button', { name: /正在刷新/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {});
  });

  it('shows skeletons while the first valuation loads', async () => {
    setNetWorth({ status: 'loading', latest: null });
    renderWindow();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {});
  });

  it('closes its panel from the title bar close button', async () => {
    renderWindow();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(close).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });
});

describe('StashValueWindow errors', () => {
  it('replaces the header with the error and a Retry when nothing was valued yet', async () => {
    setNetWorth({ status: 'error', error: 'PD2 is down', latest: null });
    renderWindow();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('PD2 is down');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByText('暂无估值记录')).not.toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: /重试/ }));
    expect(vi.mocked(netWorth.takeSnapshot).mock.calls).toEqual([['manual']]);
    await act(async () => {});
  });

  it('keeps the last valuation visible alongside a refresh error', async () => {
    setNetWorth({ status: 'error', error: 'timeout' });
    renderWindow();
    expect(screen.getByRole('alert').textContent).toContain('timeout');
    expect(screen.getByText('12.50')).not.toBeNull();
    await act(async () => {});
  });

  it('shows no history prompt or tracking banner', async () => {
    renderWindow();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/保存估值历史|估值历史记录已关闭/)).toBeNull();
    await act(async () => {});
  });
});

describe('StashValueWindow re-value when stale', () => {
  it('re-values on open when the last snapshot is older than two minutes', async () => {
    setNetWorth({ lastSnapshotAt: NOW.getTime() - 2 * 60_000 - 1 });
    renderWindow();
    expect(vi.mocked(netWorth.takeSnapshot).mock.calls).toEqual([['manual']]);
    await act(async () => {});
  });

  it('re-values on open when there is no snapshot yet', async () => {
    setNetWorth({ lastSnapshotAt: null, latest: null, status: 'idle' });
    renderWindow();
    expect(netWorth.takeSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it.each([
    ['the snapshot is fresh', { lastSnapshotAt: NOW.getTime() - 60_000 }],
    ['a snapshot is already loading', { lastSnapshotAt: null, status: 'loading' as const }],
    ['there is no account', { lastSnapshotAt: null, owner: null }],
  ])('does not re-value when %s', async (_, overrides) => {
    setNetWorth(overrides);
    const { rerender } = renderWindow();
    reopen(undefined);
    rerender(<StashValueWindow />);
    expect(netWorth.takeSnapshot).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('re-values when the panel is opened again once the snapshot went stale', async () => {
    const { rerender } = renderWindow();
    expect(netWorth.takeSnapshot).not.toHaveBeenCalled();
    vi.setSystemTime(NOW.getTime() + 3 * 60_000);
    reopen(undefined);
    rerender(<StashValueWindow />);
    expect(netWorth.takeSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it('re-values when the panel shows again after the game regains focus, not while it is hidden', async () => {
    const { rerender } = renderWindow();
    vi.setSystemTime(NOW.getTime() + 3 * 60_000);
    gameFocused = false;
    rerender(<StashValueWindow />);
    expect(netWorth.takeSnapshot).not.toHaveBeenCalled();
    gameFocused = true;
    rerender(<StashValueWindow />);
    expect(netWorth.takeSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });
});

describe('StashValueWindow tabs', () => {
  it('opens on Overview, or on the tab in the panel payload', async () => {
    renderWindow();
    expect(screen.getByRole('tab', { name: '概览' }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    reopen({ tab: 'history' });
    renderWindow();
    expect(screen.getByRole('tab', { name: /历史记录/ }).getAttribute('aria-selected')).toBe('true');
    await act(async () => {});
  });

  it('switches tab when the panel is opened again on a tab, and keeps it when opened without one', async () => {
    const { rerender } = renderWindow();
    await act(async () => {});
    reopen({ tab: 'history' });
    rerender(<StashValueWindow />);
    expect(screen.getByRole('tab', { name: /历史记录/ }).getAttribute('aria-selected')).toBe('true');
    reopen(undefined);
    rerender(<StashValueWindow />);
    expect(screen.getByRole('tab', { name: /历史记录/ }).getAttribute('aria-selected')).toBe('true');
    reopen({ tab: 'overview' });
    rerender(<StashValueWindow />);
    expect(screen.getByRole('tab', { name: '概览' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows only the holdings of the tab categories, with the stash tab for uniques', async () => {
    setNetWorth({
      latest: snapshot({
        valuation: valuation({
          lines: [
            line('Ber Rune', 'runes', 6),
            line('Perfect Ruby', 'gems', 2),
            line('Wirt Leg', 'mats', 1),
            { ...line('Shako', 'uniques', 3.5), tab: 'Shared 2' },
          ],
        }),
      }),
    });
    renderWindow();
    openTab('宝石与材料');
    const panel = screen.getByRole('tabpanel');
    expect([...panel.querySelectorAll('tbody td:first-child p')].map((p) => p.textContent)).toEqual([
      'Perfect Ruby',
      'Wirt Leg',
    ]);
    expect(within(panel).queryByRole('button', { name: 'Rune exchange' })).toBeNull();

    openTab('暗金与套装');
    expect(screen.getByRole('tabpanel').querySelector('tbody td:first-child')?.textContent).toBe('军帽Shared 2');
    expect(within(screen.getByRole('tabpanel')).getByTitle('Shako')).not.toBeNull();

    openTab('符文');
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Rune exchange' })).not.toBeNull();
    await act(async () => {});
  });

  it('shows a skeleton in holdings tabs until the first valuation', async () => {
    setNetWorth({ status: 'loading', latest: null });
    renderWindow();
    openTab('通货');
    expect(screen.getByRole('tabpanel').querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => {});
  });

  it('offers the Rares tab only when the snapshot came with appraised rares', async () => {
    renderWindow();
    expect(screen.queryByRole('tab', { name: '稀有物品' })).toBeNull();
    cleanup();

    const summary: RaresSummary = {
      keep: 0,
      check: 0,
      checkHigh: 0,
      vendor: 1,
      keepLowHr: 0,
      keepHighHr: 0,
      keepUnpriced: 0,
    };
    const vendor: RareAppraisal = {
      id: 'r1',
      name: 'Grim Band',
      baseName: 'Ring',
      slot: 'ring',
      tab: 'Shared 1',
      position: null,
      verdict: 'vendor',
      checkPriority: null,
      rank: 0.1,
      rankError: 0.1,
      stats: [],
      market: null,
      modelMode: 'softcore',
      modelVersion: 'v1',
    };
    setNetWorth({ latest: snapshot({ rares: [vendor] }) });
    renderWindow();
    expect(screen.queryByRole('tab', { name: '稀有物品' })).toBeNull();
    cleanup();

    setNetWorth({ latest: snapshot({ rares: [vendor], raresSummary: summary }) });
    renderWindow();
    openTab('稀有物品');
    expect(screen.getByText('1 件可能卖店 · Shared 1')).not.toBeNull();
    await act(async () => {});
  });
});

describe('StashValueWindow history tab', () => {
  it('points to Settings → Net Worth when history is off', async () => {
    setNetWorth({ trackingEnabled: false });
    renderWindow();
    openTab(/历史记录/);
    expect(screen.getByText('估值历史记录已关闭')).not.toBeNull();
    expect(screen.getByText(/设置 → 仓库估值.*保存估值历史/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /开启估值历史/ })).toBeNull();
    await act(async () => {});
  });

  it('hands the season points and refresh key to the history view and reloads on change', async () => {
    vi.mocked(getPoints).mockResolvedValue({ points: [point('2026-10-16T00:00:00.000Z', 3)] });
    renderWindow();
    openTab(/历史记录/);
    await waitFor(() => expect(screen.getByTestId('history').textContent).toContain('points=1'));
    expect(screen.getByTestId('history').textContent).toContain('refreshKey=2026-10-18T11:59:00.000Z');
    expect(screen.getByTestId('history').textContent).toContain('season=s12');

    vi.mocked(getPoints).mockResolvedValue({ points: [] });
    fireEvent.click(screen.getByRole('button', { name: 'history changed' }));
    await waitFor(() => expect(screen.getByTestId('history').textContent).toContain('points=0'));
    expect(getPoints).toHaveBeenCalledTimes(2);
  });

  it('waits for the account before showing history', async () => {
    setNetWorth({ owner: null, latest: null, status: 'idle' });
    renderWindow();
    openTab(/历史记录/);
    expect(screen.queryByTestId('history')).toBeNull();
    expect(screen.getByRole('tabpanel').querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => {});
  });
});
