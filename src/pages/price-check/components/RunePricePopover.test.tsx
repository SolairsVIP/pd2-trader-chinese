// @vitest-environment happy-dom
import React, { useState } from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ItemValue, RuneCombination } from '../lib/types';
import { RunePricePopover } from './RunePricePopover';

// happy-dom's WAAPI rejects cancelled animations as unhandled errors; finish motion instantly instead.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

const rune = (name: string, price: number, extra: Partial<ItemValue> = {}): ItemValue => ({
  name,
  price,
  numListings: 12,
  isCalculated: false,
  ...extra,
});

const RUNES: ItemValue[] = [
  rune('Ber Rune', 1.5, { numListings: 40 }),
  rune('Jah Rune', 1.2, { numListings: 25 }),
  rune('Vex Rune', 0.25, { isFixed: true }),
  rune('Ist Rune', 0.05, { isFixed: true }),
  rune('Mal Rune', 0.03, { isFixed: true }),
];

type Props = React.ComponentProps<typeof RunePricePopover>;

function open(props: Partial<Props> = {}) {
  const onRuneBreakdownSelect = vi.fn();
  render(
    <RunePricePopover
      loading={false}
      calculatedRuneValues={RUNES}
      selectedRuneBreakdown={null}
      selectedRuneCombinations={[]}
      onRuneBreakdownSelect={onRuneBreakdownSelect}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '符文价格' }));
  return { onRuneBreakdownSelect, dialog: screen.getByRole('dialog') };
}

const runeButton = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}`) });

describe('RunePricePopover', () => {
  it('is closed until the toolbar button is clicked', () => {
    render(
      <RunePricePopover
        loading={false}
        calculatedRuneValues={RUNES}
        selectedRuneBreakdown={null}
        selectedRuneCombinations={[]}
        onRuneBreakdownSelect={() => {}}
      />,
    );
    expect(screen.queryByText('当前符文价格')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '符文价格' }));
    expect(screen.getByText('当前符文价格')).not.toBeNull();
  });

  it('shows a loading placeholder instead of prices while loading', () => {
    const { dialog } = open({ loading: true });
    expect(within(dialog).getByText('正在加载符文数据……')).not.toBeNull();
    expect(runeButton('Ber Rune')).toBeNull();
    expect(within(dialog).queryByText(/显示更多/)).toBeNull();
  });

  it('lists high runes with market prices and listing counts, hiding low runes behind Show More', () => {
    open();
    const ber = runeButton('Ber Rune')!;
    expect(ber.textContent).toContain('1.5 HR');
    expect(ber.textContent).toContain('(40 个挂单)');
    expect(runeButton('Ist Rune')).toBeNull();
    expect(runeButton('Mal Rune')).toBeNull();
    // Vex is fixed-priced but not one of the "low" runes
    expect(runeButton('Vex Rune')!.textContent).toContain('(固定价格)');
  });

  it('marks fixed-priced runes with an asterisk instead of a listing count', () => {
    open();
    const vex = runeButton('Vex Rune')!;
    expect(vex.textContent).toContain('0.25 HR*');
    expect(vex.textContent).not.toContain('挂单');
  });

  it('Show More reveals the low runes and Show Less hides them again', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /显示更多（2 个低阶符文）/ }));
    expect(runeButton('Ist Rune')).not.toBeNull();
    expect(runeButton('Mal Rune')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /收起/ }));
    expect(runeButton('Ist Rune')).toBeNull();
  });

  it('has no Show More when there are no low runes', () => {
    const { dialog } = open({ calculatedRuneValues: RUNES.slice(0, 2) });
    expect(within(dialog).queryByText(/显示更多/)).toBeNull();
  });

  it('selecting a rune requests its breakdown; selecting it again clears it', () => {
    const { onRuneBreakdownSelect } = open({ selectedRuneBreakdown: 'Jah Rune' });
    expect(runeButton('Jah Rune')!.getAttribute('aria-pressed')).toBe('true');
    expect(runeButton('Ber Rune')!.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(runeButton('Ber Rune')!);
    expect(onRuneBreakdownSelect).toHaveBeenLastCalledWith('Ber Rune');
    fireEvent.click(runeButton('Jah Rune')!);
    expect(onRuneBreakdownSelect).toHaveBeenLastCalledWith(null);
  });

  it('breakdown lists combinations against the target, colouring by distance', () => {
    const combos: RuneCombination[] = [
      { runes: [{ name: 'Jah Rune', price: 1.2, count: 1 }], totalValue: 1.2, difference: 0.05 },
      {
        runes: [
          { name: 'Vex Rune', price: 0.25, count: 4 },
          { name: 'Ist Rune', price: 0.05, count: 2 },
        ],
        totalValue: 1.1,
        difference: 0.4,
      },
      { runes: [{ name: 'Mal Rune', price: 0.03, count: 3 }], totalValue: 0.09, difference: 1.41 },
    ];
    const { dialog } = open({ selectedRuneBreakdown: 'Ber Rune', selectedRuneCombinations: combos });

    expect(within(dialog).getByText('目标 1.5 HR')).not.toBeNull();

    const exact = within(dialog).getByText('1 个 Jah');
    expect(exact.parentElement!.textContent).toContain('= 1.2 HR');
    // tiny differences (<= 0.1) are not worth a Diff line
    expect(exact.closest('div.rounded-md')!.textContent).not.toContain('差值');
    expect(within(dialog).getByText('= 1.2 HR').className).toContain('text-success');

    const near = within(dialog).getByText('4 个 Vex + 2 个 Ist');
    expect(near.closest('div.rounded-md')!.textContent).toContain('差值：0.4 HR');
    expect(within(dialog).getByText('= 1.1 HR').className).toContain('text-warning');

    expect(within(dialog).getByText('= 0.09 HR').className).toContain('text-muted-foreground');
  });

  it('shows no breakdown when the selected rune has no combinations', () => {
    const { dialog } = open({ selectedRuneBreakdown: 'Ber Rune', selectedRuneCombinations: [] });
    expect(within(dialog).queryByText(/兑换组合：/)).toBeNull();
  });

  it('clicking a rune in a stateful parent swaps the breakdown target', async () => {
    function Parent() {
      const [sel, setSel] = useState<string | null>(null);
      return (
        <RunePricePopover
          loading={false}
          calculatedRuneValues={RUNES}
          selectedRuneBreakdown={sel}
          selectedRuneCombinations={
            sel ? [{ runes: [{ name: 'Vex Rune', price: 0.25, count: 2 }], totalValue: 0.5, difference: 1 }] : []
          }
          onRuneBreakdownSelect={setSel}
        />
      );
    }
    render(<Parent />);
    fireEvent.click(screen.getByRole('button', { name: '符文价格' }));
    fireEvent.click(runeButton('Jah Rune')!);
    expect(await screen.findByText('目标 1.2 HR')).not.toBeNull();
    fireEvent.click(runeButton('Jah Rune')!);
    await waitFor(() => expect(screen.queryByText(/目标/)).toBeNull());
  });
});
