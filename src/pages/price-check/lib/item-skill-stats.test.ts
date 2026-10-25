import { describe, expect, it } from 'vitest';
import { normalizeItemSkillStat } from './item-skill-stats';
import { getSkillFilter } from './skill-stats';
import { getStatKey } from './utils';
import { buildGetMarketListingQuery, buildTradeUrl } from './tradeUrlBuilder';
import type { Item, Stat } from './interfaces';

const bonus: Stat = { name: '+12 to Raise Skeleton Archer', skill: 'Raise Skeleton Archer', value: 12 };
const item: Item = { iLevel: 85, quality: 'Unique', name: 'Tombsong', type: 'Sharp Arrows', stats: [bonus] };

describe('fixed-item missing skill kind', () => {
  it('keeps Tombsong oskill identity consistent in the row, query and official URL', () => {
    const normalized = normalizeItemSkillStat(item, bonus);
    expect(getSkillFilter(normalized)).toMatchObject({ property: 'item_nonclassskill', params: [89], value: 12 });
    const selected = new Set([getStatKey(normalized)]);
    const settings = { mode: 'softcore', ladder: 'ladder' };
    const query = buildGetMarketListingQuery(item, undefined, selected, {}, settings);
    expect(query['item.modifiers']).toEqual({ $all: [{ $elemMatch: { name: 'item_nonclassskill', 'values.0': 89 } }] });
    const url = new URL(
      buildTradeUrl(item, undefined, selected, { [getStatKey(normalized)]: { min: '12' } }, settings),
    );
    expect(url.searchParams.get('properties[item_nonclassskill{89}][min]')).toBe('12');
  });

  it.each([
    { ...item, name: 'Unknown Unique' },
    { ...item, type: 'Ring' },
    { ...item, quality: 'Rare' },
  ])('does not infer from an unverified fixed item: %o', (source) => {
    expect(normalizeItemSkillStat(source, bonus).stat_id).toBe(107);
  });

  it.each([
    { ...bonus, stat_id: 107 },
    { ...bonus, corrupted: true },
    { ...bonus, value: 11 },
    { ...bonus, name: '+12 to Raise Skeleton Archer (Necromancer Only)' },
  ])('preserves explicit identity, corruption and contradictory/mismatching rolls: %o', (stat) => {
    expect(normalizeItemSkillStat(item, stat).stat_id).toBe(107);
  });
});
