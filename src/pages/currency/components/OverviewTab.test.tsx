// @vitest-environment happy-dom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { NetWorthCategory, Valuation, ValuationLine } from '@/lib/networth-api';
import { OverviewTab } from './OverviewTab';

afterEach(cleanup);

const NO_CATEGORIES: Record<NetWorthCategory, number> = {
  runes: 0,
  currency: 0,
  ubers: 0,
  gems: 0,
  mats: 0,
  uniques: 0,
  sets: 0,
  other: 0,
};

function line(i: number, overrides: Partial<ValuationLine> = {}): ValuationLine {
  return {
    key: `item-${i}`,
    name: `Item ${i}`,
    category: 'runes',
    qty: 1,
    unitPrice: 1,
    value: 1,
    confidence: 'ok',
    sampleCount: 10,
    priceChange7dPercent: null,
    tab: null,
    iconPath: null,
    ...overrides,
  };
}

function valuation(overrides: Partial<Valuation> = {}): Valuation {
  return {
    account: 'acc',
    isLadder: true,
    isHardcore: false,
    seasonId: 's12',
    takenAt: '2026-10-18T10:00:00.000Z',
    priceDay: '2026-10-18',
    priceSource: 'market',
    totalHr: 0,
    uncertainHr: 0,
    unpricedCount: 0,
    gold: 0,
    byCategory: { ...NO_CATEGORIES },
    byTab: {},
    lines: [],
    ...overrides,
  };
}

function renderOverview(v: Valuation) {
  return render(
    <TooltipProvider>
      <OverviewTab valuation={v} />
    </TooltipProvider>,
  );
}

describe('OverviewTab', () => {
  it('shows the category legend with share of the total, skipping empty categories', () => {
    renderOverview(
      valuation({
        totalHr: 10,
        byCategory: { ...NO_CATEGORIES, runes: 7.5, ubers: 2.5 },
      }),
    );
    expect(screen.getByText('符文').nextElementSibling?.textContent).toBe('75% · 7.50');
    expect(screen.getByText('Uber 材料').nextElementSibling?.textContent).toBe('25% · 2.50');
    expect(screen.queryByText('通货')).toBeNull();
    expect(within(screen.getByText('符文').closest('section')!).queryByText('暂无可估值物品。')).toBeNull();
  });

  it('shows empty states when nothing is priced', () => {
    const { container } = renderOverview(valuation({ lines: [line(1, { value: 0 })] }));
    expect(within(container.querySelector('section')!).getByText('暂无可估值物品。')).not.toBeNull();
    expect(within(screen.getByRole('heading', { name: '估值最高的物品' }).closest('section')!).getByText('暂无可估值物品。')).not.toBeNull();
    expect(screen.queryByText(/按估值排序 · 前 \d+ 件/)).toBeNull();
    expect(screen.queryByText('按仓库页分类')).toBeNull();
  });

  it('lists at most ten positive-value holdings, in the given order', () => {
    const lines = [line(0, { value: 0 }), ...Array.from({ length: 12 }, (_, i) => line(i + 1, { value: 20 - i }))];
    renderOverview(valuation({ totalHr: 200, byCategory: { ...NO_CATEGORIES, runes: 200 }, lines }));
    expect(screen.getByText('按估值排序 · 前 10 件')).not.toBeNull();
    expect(screen.queryByText('Item 0')).toBeNull();
    expect(screen.getByText('Item 10')).not.toBeNull();
    expect(screen.queryByText('Item 11')).toBeNull();
  });

  it('shows the stash tab only for holdings that have one', () => {
    renderOverview(
      valuation({
        totalHr: 2,
        lines: [line(1, { tab: 'Shared 3' }), line(2)],
      }),
    );
    expect(screen.getByText('Item 1').closest('p')?.nextElementSibling?.textContent).toBe('Shared 3');
    expect(screen.getByText('Item 2').closest('p')?.nextElementSibling).toBeNull();
  });

  it('formats unit price with extra precision for sub-cent values', () => {
    renderOverview(valuation({ totalHr: 1, lines: [line(1, { qty: 400, unitPrice: 0.0025, value: 1 })] }));
    expect(screen.getByText('0.0025')).not.toBeNull();
  });

  it('reports unpriced, uncertain and gold amounts for different counts', () => {
    renderOverview(valuation({ unpricedCount: 1, uncertainHr: 1.234, gold: 2_500_000 }));
    const note = screen.getByText(/件物品暂无价格/).textContent?.replace(/\s+/g, ' ') ?? '';
    expect(note).toContain('1 件物品暂无价格');
    expect(note).toContain('1.23 HR');
    expect(note).toContain('估值可信度较低，未计入总值');
    expect(note).toContain(`${(2_500_000).toLocaleString()} 金币`);

    cleanup();
    renderOverview(valuation({ unpricedCount: 3 }));
    expect(screen.getByText(/件物品暂无价格/).textContent?.replace(/\s+/g, ' ')).toContain('3 件物品暂无价格');
  });

  it('ranks stash tabs by value and scales bars to the largest tab', () => {
    renderOverview(
      valuation({
        totalHr: 6,
        byTab: { 'Shared 1': 1.5, Personal: 0, 'Shared 2': 6 },
      }),
    );
    const section = screen.getByText('按仓库页分类').closest('section')!;
    const rows = [...section.querySelectorAll('.group')];
    expect(rows.map((r) => r.firstElementChild?.textContent)).toEqual(['Shared 2', 'Shared 1']);
    expect(rows.map((r) => r.lastElementChild?.textContent)).toEqual(['6.00', '1.50']);
    const widths = rows.map((r) => (r.querySelector('.h-2.origin-left') as HTMLElement).style.width);
    expect(widths).toEqual(['100%', '25%']);
  });
});
