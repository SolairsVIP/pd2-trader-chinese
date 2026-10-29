// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ValuationLine } from '@/lib/networth-api';
import { HoldingsTable } from './HoldingsTable';

afterEach(cleanup);

function line(overrides: Partial<ValuationLine> & Pick<ValuationLine, 'key' | 'name'>): ValuationLine {
  return {
    category: 'runes',
    qty: 1,
    unitPrice: 1,
    value: 1,
    confidence: 'ok',
    sampleCount: 20,
    priceChange7dPercent: null,
    tab: null,
    iconPath: null,
    ...overrides,
  };
}

const LINES: ValuationLine[] = [
  line({ key: 'ist', name: 'Ist Rune', qty: 4, unitPrice: 0.5, value: 2, priceChange7dPercent: 12.4, tab: 'Shared 1' }),
  line({ key: 'ber', name: 'Ber Rune', qty: 1, unitPrice: 6, value: 6, priceChange7dPercent: -3.6, tab: 'Shared 2' }),
  line({ key: 'mal', name: 'Mal Rune', qty: 2, unitPrice: null, value: 0.5, confidence: 'fixed', tab: 'Shared 1' }),
  line({ key: 'el', name: 'El Rune', qty: 30, unitPrice: null, value: 0, confidence: 'none', sampleCount: 0 }),
];

function renderTable(props: Partial<React.ComponentProps<typeof HoldingsTable>> = {}) {
  return render(
    <TooltipProvider>
      <HoldingsTable lines={LINES}
        totalHr={8.5}
        {...props} />
    </TooltipProvider>,
  );
}

/** Item names of the body rows, top to bottom. */
function rowNames(): string[] {
  const body = document.querySelector('tbody')!;
  return [...body.querySelectorAll('tr')].map((tr) => tr.querySelector('td p')?.textContent ?? tr.textContent ?? '');
}

function rowCells(name: string): string[] {
  const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td p')?.textContent === name)!;
  return [...row.querySelectorAll('td')].map((td) => td.textContent ?? '');
}

function search(text: string) {
  fireEvent.change(screen.getByLabelText('搜索仓库物品'), { target: { value: text } });
}

describe('HoldingsTable', () => {
  it('lists holdings by value, highest first, with zero-value rows hidden by default', () => {
    renderTable();
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune']);
    expect(screen.getByText(/1 件零估值物品已隐藏/)).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: '估值' }).getAttribute('aria-sort')).toBe('descending');
  });

  it('formats unit price, share of total and 7d change per row', () => {
    renderTable();
    // Item, Qty, Unit, Value, %, 7d, Price
    expect(rowCells('Ber Rune').slice(1, 6)).toEqual(['1', '6.00', '6.00 HR', '70.6%', '▼4%']);
    expect(rowCells('Ist Rune').slice(1, 6)).toEqual(['4', '0.50', '2.00 HR', '23.5%', '▲12%']);
    expect(rowCells('Mal Rune').slice(1, 6)).toEqual(['2', '—', '0.50 HR', '5.9%', '—']);
    expect(rowCells('Mal Rune')[6]).toBe('固定值');
  });

  it('shows a 0% share instead of dividing by a zero total', () => {
    renderTable({ totalHr: 0 });
    expect(rowCells('Ber Rune')[4]).toBe('0.0%');
  });

  it('footer totals only the visible holdings', () => {
    renderTable();
    expect(screen.getByText(/3.*件物品/).textContent?.replace(/\s+/g, ' ').trim()).toBe('3 件物品 · 8.50 HR');
    search('ber');
    expect(screen.getByText(/1.*件物品/).textContent?.replace(/\s+/g, ' ').trim()).toBe('1 件物品 · 6.00 HR');
  });

  it('cycles a column through ascending, descending and back to unsorted', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: '物品: sort ascending' }));
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune']);
    expect(screen.getByRole('columnheader', { name: /物品/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: '估值' }).getAttribute('aria-sort')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '物品: sort descending' }));
    expect(rowNames()).toEqual(['Mal Rune', 'Ist Rune', 'Ber Rune']);

    fireEvent.click(screen.getByRole('button', { name: '物品: clear sorting' }));
    expect(rowNames()).toEqual(['Ist Rune', 'Ber Rune', 'Mal Rune']);
    expect(screen.getByRole('columnheader', { name: /物品/ }).getAttribute('aria-sort')).toBeNull();
  });

  it('sorts numeric columns by number, not by text', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: '数量: sort ascending' }));
    expect(rowNames()).toEqual(['Ber Rune', 'Mal Rune', 'Ist Rune']);
    fireEvent.click(screen.getByRole('button', { name: '数量: sort descending' }));
    expect(rowNames()).toEqual(['Ist Rune', 'Mal Rune', 'Ber Rune']);
  });

  it('keeps unpriced rows last when sorting by unit price in either direction', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: '单价: sort ascending' }));
    expect(rowNames()).toEqual(['Ist Rune', 'Ber Rune', 'Mal Rune']);
    fireEvent.click(screen.getByRole('button', { name: '单价: sort descending' }));
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune']);
  });

  it('keeps rows without 7d change last when sorting by change', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: '7天: sort ascending' }));
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune']);
    fireEvent.click(screen.getByRole('button', { name: '7天: sort descending' }));
    expect(rowNames()).toEqual(['Ist Rune', 'Ber Rune', 'Mal Rune']);
  });

  it('does not offer sorting on the price confidence column', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: '估值依据' });
    expect(within(header).queryByRole('button')).toBeNull();
  });

  it('filters by item name or stash tab, case-insensitively and ignoring surrounding spaces', () => {
    renderTable();
    search('  RUNE ');
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune']);
    search('shared 1');
    expect(rowNames()).toEqual(['Ist Rune', 'Mal Rune']);
    search('ist');
    expect(rowNames()).toEqual(['Ist Rune']);
  });

  it('clears the search with the clear button and with Escape', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: '清除搜索' })).toBeNull();
    search('ber');
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
    expect((screen.getByLabelText('搜索仓库物品') as HTMLInputElement).value).toBe('');
    expect(rowNames()).toHaveLength(3);

    search('ber');
    fireEvent.keyDown(screen.getByLabelText('搜索仓库物品'), { key: 'Escape' });
    expect((screen.getByLabelText('搜索仓库物品') as HTMLInputElement).value).toBe('');
  });

  it('lets Escape bubble (e.g. to close the window) when the search is already empty', () => {
    renderTable();
    let bubbled = 0;
    const onKeyDown = () => bubbled++;
    document.addEventListener('keydown', onKeyDown);
    try {
      search('ber');
      fireEvent.keyDown(screen.getByLabelText('搜索仓库物品'), { key: 'Escape' });
      expect(bubbled).toBe(0);
      fireEvent.keyDown(screen.getByLabelText('搜索仓库物品'), { key: 'Escape' });
      expect(bubbled).toBe(1);
    } finally {
      document.removeEventListener('keydown', onKeyDown);
    }
  });

  it('shows zero-value rows after turning off "Hide zero value"', () => {
    renderTable();
    fireEvent.click(screen.getByRole('switch'));
    expect(rowNames()).toEqual(['Ber Rune', 'Ist Rune', 'Mal Rune', 'El Rune']);
    expect(screen.queryByText(/零估值物品已隐藏/)).toBeNull();
    expect(rowCells('El Rune')[6]).toBe('暂无价格');
  });

  it('shows the count of hidden zero-value rows', () => {
    renderTable({ lines: [...LINES, line({ key: 'eld', name: 'Eld Rune', value: 0 })] });
    expect(screen.getByText(/2 件零估值物品已隐藏/)).not.toBeNull();
  });

  it('says the stash has none when there are no lines at all', () => {
    renderTable({ lines: [] });
    expect(screen.getByText('仓库中没有此类物品。')).not.toBeNull();
    expect(screen.queryByText(/件物品 ·/)).toBeNull();
  });

  it('says nothing matches when every line is filtered out', () => {
    renderTable();
    search('zod');
    expect(screen.getByText('没有符合条件的物品。')).not.toBeNull();
    expect(screen.queryByText(/件物品 ·/)).toBeNull();
  });

  it('says nothing matches when every line is a hidden zero-value row', () => {
    renderTable({ lines: [line({ key: 'el', name: 'El Rune', value: 0 })] });
    expect(screen.getByText('没有符合条件的物品。')).not.toBeNull();
    expect(screen.getByText(/1 件零估值物品已隐藏/)).not.toBeNull();
  });

  it('shows the stash tab under the name only when asked to', () => {
    renderTable({ showTab: true });
    expect(rowCells('Ber Rune')[0]).toBe('Ber RuneShared 2');
    cleanup();
    renderTable();
    expect(rowCells('Ber Rune')[0]).toBe('Ber Rune');
  });

  it('falls back to the category dot when the item icon fails to load', () => {
    renderTable({ lines: [line({ key: 'ber', name: 'Ber Rune', iconPath: '/ber.png' })] });
    const img = document.querySelector('tbody img')!;
    expect(img.getAttribute('src')).toBe('/ber.png');
    fireEvent.error(img);
    expect(document.querySelector('tbody img')).toBeNull();
  });

  it('renders the toolbar slot next to the filters', () => {
    renderTable({ toolbar: <button type="button">Rune exchange</button> });
    expect(screen.getByRole('button', { name: 'Rune exchange' })).not.toBeNull();
  });
});
