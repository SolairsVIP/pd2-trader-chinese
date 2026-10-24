// @vitest-environment happy-dom
import React, { useState } from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Stat } from '@/pages/price-check/lib/interfaces';
import type { AppraisedStat } from '@/lib/rare-appraisal-api';
import { StatId } from '@/pages/price-check/lib/stat-mappings';
import { StatRow } from './StatRow';
import { getStatKey } from '../lib/utils';

// happy-dom's WAAPI rejects cancelled animations as unhandled errors; finish motion instantly instead.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

type Filters = Record<string, { value?: string; min?: string; max?: string }>;

const FCR: Stat = { stat_id: 105, name: '% Faster Cast Rate', value: 20, range: { min: 10, max: 20 } };

function renderRow(props: Partial<React.ComponentProps<typeof StatRow>> & { stat: Stat }) {
  const toggle = vi.fn();
  const updateFilter = vi.fn();
  const onSubmit = vi.fn();
  const utils = render(
    <StatRow
      updateFilter={updateFilter}
      filters={{}}
      selected={new Set()}
      toggle={toggle}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...utils, toggle, updateFilter, onSubmit };
}

/** Stateful harness mirroring how ItemOverlayWidget wires selection + filters into the row. */
function Harness({ stat, onSubmit }: { stat: Stat; onSubmit?: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({});
  return (
    <>
      <StatRow
        stat={stat}
        selected={selected}
        filters={filters}
        onSubmit={onSubmit}
        toggle={() =>
          setSelected((prev) => {
            const next = new Set(prev);
            const key = getStatKey(stat);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        updateFilter={(key, field, val) => setFilters((f) => ({ ...f, [key]: { ...f[key], [field]: val } }))}
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  );
}

describe('StatRow', () => {
  describe('skill selection availability', () => {
    it.each([
      { name: '+2 to Claw and Dagger Mastery', skill: 'Claw and Dagger Mastery', value: 2 },
      { stat_id: 97, name: '+2 to Teleport', skill: 'Teleport', value: 2 },
      { stat_id: 83, name: '+2 to Sorceress Skills', skill: 'Sorceress Skills', value: 2 },
      { stat_id: 188, name: '+2 to Fire Skills (Sorceress)', skill: 'Fire Skills (Sorceress)', value: 2 },
      { stat_id: 195, name: 'CtC Fire Ball', skill: 'Fire Ball', level: 12, chance: 17 },
      { stat_id: 151, name: 'Level 12 Conviction Aura When Equipped', skill: 'Conviction', level: 12 },
      { stat_id: 204, name: 'Level 20 Teleport (3/27 Charges)', skill: 'Teleport', level: 20 },
    ] as Stat[])('allows a fully resolved skill to be selected: $name', (stat) => {
      const { toggle } = renderRow({ stat });
      const checkbox = screen.getByRole('checkbox') as HTMLButtonElement;
      expect(checkbox.disabled).toBe(false);
      fireEvent.click(checkbox);
      expect(toggle).toHaveBeenCalledWith(stat);
      expect(screen.queryByText('暂不可筛选')).toBeNull();
    });

    it.each([
      { stat_id: 195, name: 'CtC Fire Ball', skill: 'Fire Ball', chance: 17 },
      { stat_id: 195, name: 'CtC Unknown', skill: 'Not A Skill', level: 12, chance: 17 },
      { stat_id: 188, name: 'Combat Skills', skill: 'Combat Skills', value: 2 },
      { stat_id: 204, name: 'Charged Skill', skill: 'Teleport' },
    ] as Stat[])('explains and disables an unresolved skill: $name', (stat) => {
      const { toggle } = renderRow({ stat });
      const checkbox = screen.getByRole('checkbox') as HTMLButtonElement;
      expect(checkbox.disabled).toBe(true);
      expect(checkbox.title).toContain('暂不能精确筛选');
      fireEvent.click(checkbox);
      expect(toggle).not.toHaveBeenCalled();
      expect(screen.getByText('暂不可筛选')).not.toBeNull();
    });

    it('explains the fixed level and remaining-use inputs beside the charged skill', () => {
      renderRow({ stat: { stat_id: 204, name: 'Level 20 Teleport (3/27 Charges)', skill: 'Teleport', level: 20 } });
      expect(screen.getByText('（等级固定为 20；数值筛选剩余次数）')).not.toBeNull();
    });
  });

  it('shows the stat name, rolled value and its possible range', () => {
    const { container } = renderRow({ stat: FCR });
    expect(container.textContent).toContain('% 快速施法率');
    expect(container.textContent).toContain('20');
    expect(container.textContent).toContain('(10-20)');
  });

  it('omits the range for socket rows (sockets are a count, not a roll)', () => {
    const { container } = renderRow({
      stat: { stat_id: StatId.Socket, name: 'Sockets', value: 4, range: { min: 4, max: 4 } },
    });
    expect(container.textContent).toContain('Sockets: 4');
    expect(container.textContent).not.toContain('(4-4)');
  });

  it('hides min/max inputs until the stat is selected', () => {
    renderRow({ stat: FCR });
    expect(screen.queryByLabelText('% 快速施法率最小值')).toBeNull();
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });

  it('selecting a stat reveals editable min/max inputs that report under the stat key', async () => {
    render(<Harness stat={FCR} />);
    fireEvent.click(screen.getByRole('checkbox'));

    const min = await screen.findByLabelText('% 快速施法率最小值');
    const max = screen.getByLabelText('% 快速施法率最大值');
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');

    fireEvent.change(min, { target: { value: '15' } });
    fireEvent.change(max, { target: { value: '20' } });

    expect(JSON.parse(screen.getByTestId('filters').textContent!)).toEqual({ 'id:105': { min: '15', max: '20' } });
    expect((min as HTMLInputElement).value).toBe('15');
  });

  it('deselecting removes the range inputs again', async () => {
    render(<Harness stat={FCR} />);
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByLabelText('% 快速施法率最小值');
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.queryByLabelText('% 快速施法率最小值')).toBeNull());
  });

  it('pre-fills the inputs from existing filters', () => {
    renderRow({
      stat: FCR,
      selected: new Set(['id:105']),
      filters: { 'id:105': { min: '12', max: '' } },
    });
    expect((screen.getByLabelText('% 快速施法率最小值') as HTMLInputElement).value).toBe('12');
    expect((screen.getByLabelText('% 快速施法率最大值') as HTMLInputElement).value).toBe('');
  });

  it('Enter inside a range input submits the search; other keys do not', () => {
    const { onSubmit } = renderRow({ stat: FCR, selected: new Set(['id:105']) });
    const max = screen.getByLabelText('% 快速施法率最大值');
    fireEvent.keyDown(max, { key: 'a' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(max, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('skill stats are keyed by the lower-cased skill name, not the shared stat id', () => {
    const { updateFilter } = renderRow({
      stat: { stat_id: 107, name: 'to Blizzard', skill: 'Blizzard', value: 3 },
      selected: new Set(['skill:item_singleskill{59}']),
    });
    fireEvent.change(screen.getByLabelText('to Blizzard最小值'), { target: { value: '2' } });
    expect(updateFilter).toHaveBeenCalledWith('skill:item_singleskill{59}', 'min', '2');
  });

  it('marks unmapped stats as Unknown with a disabled checkbox', () => {
    const { toggle } = renderRow({ stat: { stat_id: 987654, name: 'Mystery Stat', value: 1 } });
    expect(screen.getByText('未知属性')).not.toBeNull();
    const checkbox = screen.getByRole('checkbox') as HTMLButtonElement;
    expect(checkbox.disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('marks skills that match no known skill as Unknown', () => {
    renderRow({ stat: { stat_id: 107, name: 'to Zzqxv Nonsense', skill: 'Zzqxv Nonsense', value: 1 } });
    expect(screen.getByText('暂不可筛选')).not.toBeNull();
  });

  it('ethereal rows toggle but never show range inputs', () => {
    renderRow({ stat: { stat_id: StatId.Ethereal, name: 'Ethereal' }, selected: new Set([`id:${StatId.Ethereal}`]) });
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Ethereal minimum')).toBeNull();
  });

  it('flags corrupted stats with an asterisk', () => {
    renderRow({ stat: { ...FCR, corrupted: true } });
    expect(screen.getByTitle('腐化属性').textContent).toBe('*');
  });

  describe('corrupted tri-state filter', () => {
    const corrupted: Stat = { stat_id: StatId.Corrupted, name: 'Corrupted', value: 1 };

    it.each([
      [0, 'false', null],
      [1, 'true', 'only'],
      [2, 'mixed', 'excluded'],
    ] as const)('state %i renders aria-checked=%s with hint %s', (state, aria, hint) => {
      const { container } = renderRow({ stat: corrupted, corruptedState: state });
      const box = screen.getByRole('checkbox', { name: '腐化筛选' });
      expect(box.getAttribute('aria-checked')).toBe(aria);
      if (hint) expect(screen.getByText(hint)).not.toBeNull();
      else {
        expect(screen.queryByText('only')).toBeNull();
        expect(screen.queryByText('excluded')).toBeNull();
      }
      // The corrupted flag's raw value is not shown, and no range inputs appear even when active
      expect(container.textContent).not.toContain(': 1');
      expect(screen.queryByLabelText('Corrupted minimum')).toBeNull();
    });

    it('toggles via click on the box, the label text, and Enter/Space keys', () => {
      const { toggle } = renderRow({ stat: corrupted });
      const box = screen.getByRole('checkbox', { name: '腐化筛选' });
      fireEvent.click(box);
      fireEvent.keyDown(box, { key: 'Enter' });
      fireEvent.keyDown(box, { key: ' ' });
      fireEvent.keyDown(box, { key: 'Tab' });
      expect(toggle).toHaveBeenCalledTimes(3);
      fireEvent.click(screen.getByText('已腐化'));
      expect(toggle).toHaveBeenCalledTimes(4);
      expect(toggle).toHaveBeenLastCalledWith(corrupted);
    });

    it('an injected (not on the item) corrupted row is styled as muted', () => {
      renderRow({ stat: { ...corrupted, _injected: true } as Stat });
      expect(screen.getByText('已腐化').className).toContain('text-muted-foreground');
      expect(screen.getByText('已腐化').className).not.toContain('text-q-corrupted');
    });
  });

  describe('rare appraisal hints', () => {
    const base: AppraisedStat = {
      label: '+20% Faster Cast Rate',
      key: 'fcr',
      value: 20,
      stars: null,
      multiplier: null,
      roll: 1,
      keyFrom: null,
      corrupted: false,
    };

    it('shows stars for a key stat with the multiplier in the tooltip', () => {
      renderRow({ stat: FCR, rare: { ...base, stars: 2, multiplier: 2.5 } });
      const stars = screen.getByText('★★');
      expect(stars.getAttribute('title')).toContain('×2.5');
    });

    it('shows "valuable from N" when the stat is below its key threshold', () => {
      const { container } = renderRow({ stat: FCR, rare: { ...base, keyFrom: 25 } });
      expect(container.textContent).toContain('从 25 起有价值');
      expect(container.textContent).not.toContain('★');
    });

    it('shows nothing extra for a non-key stat', () => {
      const { container } = renderRow({ stat: FCR, rare: base });
      expect(container.textContent).not.toContain('valuable from');
      expect(container.textContent).not.toContain('★');
    });
  });
});
