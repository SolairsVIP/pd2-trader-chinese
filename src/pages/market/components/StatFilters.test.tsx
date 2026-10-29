// @vitest-environment happy-dom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatFilter, StatPreset } from '../lib/types';
import { StatFilters } from './StatFilters';

// happy-dom rejects cancelled WAAPI animations: render motion.* as plain elements
vi.mock('framer-motion', () => import('@/pages/quick-list/motion-mock'));

const row = (id: string, over: Partial<StatFilter> = {}): StatFilter => ({
  id,
  kind: 'mod',
  key: 'item_fastercastrate',
  enabled: true,
  ...over,
});

function Harness({ initial, onStats }: { initial: StatFilter[]; onStats: (stats: StatFilter[]) => void }) {
  const [stats, setStats] = useState(initial);
  return (
    <StatFilters
      stats={stats}
      onChange={(next) => {
        setStats(next);
        onStats(next);
      }}
      builtInPresets={[] as StatPreset[]}
      userPresets={[]}
      onApplyPreset={vi.fn()}
      onSavePreset={vi.fn()}
      onRemovePreset={vi.fn()}
    />
  );
}

const mount = (initial: StatFilter[]) => {
  const onStats = vi.fn<(stats: StatFilter[]) => void>();
  render(<Harness initial={initial}
    onStats={onStats} />);
  return { latest: () => onStats.mock.calls.at(-1)?.[0] ?? initial };
};

afterEach(cleanup);

describe('StatFilters', () => {
  it('Chinese search selects the correct website skill-tab key by keyboard', () => {
    const { latest } = mount([]);
    const search = screen.getByRole('combobox', { name: '添加属性筛选' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: '召唤' } });
    const options = screen.getAllByRole('option');
    const necromancer = options.find((option) => /召唤.*死灵法师/.test(option.textContent ?? ''));
    expect(necromancer).toBeTruthy();
    fireEvent.click(necromancer!);
    expect(latest()).toMatchObject([{ kind: 'mod', key: 'item_addskill_tab{18}', enabled: true }]);
  });

  it('Chinese search supports keyboard selection without translating the submitted key', () => {
    const { latest } = mount([]);
    const search = screen.getByRole('combobox', { name: '添加属性筛选' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: '力量' } });
    fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
    expect(latest()).toEqual([]);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(latest()[0]).toMatchObject({ kind: 'mod', key: 'strength' });
  });

  it('removes a row with its always-present remove button', () => {
    const { latest } = mount([row('a'), row('b', { key: 'maxhp' })]);
    fireEvent.click(screen.getByRole('button', { name: '移除 快速施法速度 (FCR)' }));
    expect(latest().map((s) => s.id)).toEqual(['b']);
  });

  it('AND/OR toggle moves a row into the "Any of" group and back', () => {
    const { latest } = mount([row('a'), row('b', { key: 'maxhp' })]);
    expect(screen.queryByRole('region', { name: '满足任意一项' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '快速施法速度 (FCR)：必须满足' }));
    expect(latest().find((s) => s.id === 'a')?.or).toBe(true);
    const group = screen.getByRole('region', { name: '满足任意一项' });
    expect(within(group).getByText('快速施法速度 (FCR)')).toBeTruthy();
    expect(within(group).getByText('再添加一条“或”条件')).toBeTruthy();

    fireEvent.click(within(group).getByRole('button', { name: '快速施法速度 (FCR)：任意条件组（满足其中之一）' }));
    expect(latest().find((s) => s.id === 'a')?.or).toBeUndefined();
    expect(screen.queryByRole('region', { name: '满足任意一项' })).toBeNull();
  });

  it('adds cube corruptions from the stat search; unrolled ones have no min/max', () => {
    const { latest } = mount([]);
    const search = screen.getByRole('combobox', { name: '添加属性筛选' });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'corrupted sockets' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(latest()).toMatchObject([{ kind: 'corruption', key: 'item_numsockets', enabled: true }]);
    expect(screen.getByText('物品具有此腐化属性')).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: '孔数 最小值' })).toBeNull();

    fireEvent.change(search, { target: { value: 'corrupted faster cast' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(latest()[1]).toMatchObject({ kind: 'corruption', key: 'item_fastercastrate' });
    expect(screen.getByRole('spinbutton', { name: '快速施法速度 (FCR) 最小值' })).toBeTruthy();
  });

  it("splits suggestions into Mods / Pseudo / Corruptions tabs; the best match picks the tab, Tab cycles", () => {
    const { latest } = mount([]);
    const search = screen.getByRole("combobox", { name: "添加属性筛选" });
    const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "life" } });
    expect(selected()).toMatch(/^综合属性/);
    fireEvent.click(screen.getByRole("tab", { name: /^属性词条/ }));
    fireEvent.keyDown(search, { key: "Enter" });
    expect(latest()[0].kind).toBe("mod");

    fireEvent.change(search, { target: { value: "corrupted faster cast" } });
    expect(selected()).toMatch(/^腐化词条/);
    fireEvent.change(search, { target: { value: "faster cast" } });
    const first = selected();
    fireEvent.keyDown(search, { key: "Tab" });
    expect(selected()).not.toBe(first);
    for (let i = 0; i < 3 && !/^腐化词条/.test(selected() ?? ""); i++) fireEvent.keyDown(search, { key: "Tab" });
    expect(selected()).toMatch(/^腐化词条/);
    fireEvent.keyDown(search, { key: "Enter" });
    expect(latest()[1]).toMatchObject({ kind: "corruption", key: "item_fastercastrate" });
  });

  it("lists corruption rows after stat rows", () => {
    mount([row("c", { kind: "corruption", key: "item_numsockets" }), row("a"), row("b", { key: "maxhp" })]);
    const names = screen.getAllByRole("button", { name: /^移除 / }).map((b) => b.getAttribute("aria-label"));
    expect(names.at(-1)).toBe('移除 孔数');
  });
});
