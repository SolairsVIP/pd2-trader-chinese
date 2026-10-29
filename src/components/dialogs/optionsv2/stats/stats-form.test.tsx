// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import type { ISettings } from '@/hooks/useOptions';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import { StatsForm } from './stats-form';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
// vi.mock factories are hoisted above static imports, so the shim must be loaded inside the factory.
vi.mock('@/components/ui/select', async () => (await import('../test-utils')).selectShim);

const FULL: Partial<ISettings> = {
  fillStatValue: 5,
  statFillMarginUnit: 'percent',
  statFillLeaveMinEmpty: false,
  statFillLeaveMaxEmpty: false,
  statDefaultCorruptedFilter: 'both',
  rareRankDisplay: 'bar',
  priceWindowHours: 168,
};

let store: OptionsStore;

function renderForm(settings: Partial<ISettings> = FULL, isLoading = false) {
  store = createOptionsStore(settings, isLoading);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  return render(<StatsForm />);
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const lastSaved = () => store.updateSettings.mock.calls.at(-1)?.[0];
const fillInput = () => screen.getByPlaceholderText('5') as HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StatsForm', () => {
  it('shows a skeleton while loading', () => {
    renderForm(FULL, true);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('saves the price window as a number after the debounce', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('价格统计区间'), { target: { value: '720' } });
    await advance(499);
    expect(store.updateSettings).not.toHaveBeenCalled();
    await advance(1);
    expect(lastSaved()).toMatchObject({ priceWindowHours: 720, fillStatValue: 5 });
  });

  it('parses the fill value as an integer', async () => {
    renderForm();
    fireEvent.change(fillInput(), { target: { value: '12' } });
    await advance(500);
    expect(lastSaved()?.fillStatValue).toBe(12);

    fireEvent.change(fillInput(), { target: { value: '7.9' } });
    await advance(500);
    expect(lastSaved()?.fillStatValue).toBe(7);
  });

  // BUG: clearing the field calls field.onChange(undefined), which react-hook-form treats as "no value" and
  // re-renders the form's default instead, so backspacing "12" leaves "12" and the user cannot empty the box.
  it.fails('keeps an emptied fill value empty while the user is editing', () => {
    renderForm({ ...FULL, fillStatValue: 12 });
    fireEvent.change(fillInput(), { target: { value: '' } });
    expect(fillInput().value).toBe('');
  });

  it('relabels the fill value when the margin unit switches to flat', async () => {
    renderForm();
    expect(screen.queryByText('填充属性数值（%）')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('浮动单位'), { target: { value: 'flat' } });
    expect(screen.queryByText('填充属性数值（固定值）')).not.toBeNull();
    expect(screen.queryByText(/按固定数值设置/)).not.toBeNull();
    await advance(500);
    expect(lastSaved()?.statFillMarginUnit).toBe('flat');
  });

  it('saves the leave-empty switches and filters', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('switch', { name: '最大值留空' }));
    fireEvent.change(screen.getByLabelText('默认腐化筛选'), { target: { value: 'corrupted' } });
    fireEvent.change(screen.getByLabelText('稀有物品评级显示'), { target: { value: 'blocks' } });
    await advance(500);
    expect(store.updateSettings).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toMatchObject({
      statFillLeaveMaxEmpty: true,
      statFillLeaveMinEmpty: false,
      statDefaultCorruptedFilter: 'corrupted',
      rareRankDisplay: 'blocks',
    });
  });

  it('fills defaults for unset settings', () => {
    renderForm({});
    expect(fillInput().value).toBe('5');
    expect((screen.getByLabelText('价格统计区间') as HTMLSelectElement).value).toBe('168');
  });

  it('does not save back an external change', async () => {
    renderForm();
    act(() => store.replace({ ...FULL, rareRankDisplay: 'blocks' }));
    await advance(600);
    expect((screen.getByLabelText('稀有物品评级显示') as HTMLSelectElement).value).toBe('blocks');
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  // BUG: auto-save skips the zod schema (fillStatValue max 100), so an out-of-range percent margin
  // like 150% is persisted and later produces negative stat-range minimums in price checks.
  it.fails('does not persist a fill value outside 0-100', async () => {
    renderForm();
    fireEvent.change(fillInput(), { target: { value: '150' } });
    await advance(500);
    expect(store.updateSettings).not.toHaveBeenCalled();
  });
});
