import { describe, expect, it } from 'vitest';
import { skillNameToIdMap } from '@/assets/character-skills';
import { classSkillsMap, classSubSkillMap, classSubSkillMap2, getSkillTabIndex } from '@/assets/class-skills';
import type { ItemType } from '@/assets/itemFuzzySearch';
import { marketQueryToFilters } from '@/pages/market/store/priceCheckFilters';
import { parseStatKey, readStatValue } from '@/pages/market/lib/stats';
import {
  getSkillFilter,
  isSkillStat,
  normalizeSkillStat,
  resolveCharacterSkillId,
  skillFilterUnavailableReason,
} from './skill-stats';
import { getStatKey } from './utils';
import { buildGetMarketListingQuery, buildTradeUrl } from './tradeUrlBuilder';
import type { Item, Stat } from './interfaces';

const settings = { mode: 'softcore', ladder: 'ladder' };
const mapped = undefined as unknown as ItemType;
const itemWith = (stats: Stat[]): Item => ({ quality: 'Normal', type: 'Katar', iLevel: 2, sockets: 2, stats });

function assertQueryParity(stat: Stat, property: string, params: number[], valueIndex: number) {
  const item = itemWith([stat]);
  const key = getStatKey(stat);
  const selected = new Set([key]);
  const ranges = { [key]: { min: '2', max: '4' } };
  const expected: Record<string, unknown> = { name: property };
  params.forEach((param, index) => {
    expected[`values.${index}`] = param;
  });
  expected[`values.${valueIndex}`] = { $gte: 2, $lte: 4 };
  const query = buildGetMarketListingQuery(item, mapped, selected, ranges, settings);
  expect(query['item.modifiers']).toEqual({ $all: [{ $elemMatch: expected }] });
  const propertyKey = params.length ? `${property}{${params.join(',')}}` : property;
  const url = new URL(buildTradeUrl(item, mapped, selected, ranges, settings));
  expect(url.searchParams.get(`properties[${propertyKey}][min]`)).toBe('2');
  expect(url.searchParams.get(`properties[${propertyKey}][max]`)).toBe('4');
  const market = marketQueryToFilters(query as unknown as Record<string, unknown>, false);
  expect(market.stats).toMatchObject([{ key: propertyKey, min: 2, max: 4, enabled: true }]);
  expect(parseStatKey(propertyKey).valueIndex).toBe(valueIndex);
  expect(getStatKey(normalizeSkillStat(stat))).toBe(key);
}

describe('skill filter catalogue and query parity', () => {
  it('maps the observed Enchant Fire clipboard spelling to the Enchant market skill', () => {
    const stat: Stat = { name: '+1 to Enchant Fire', skill: 'Enchant Fire', value: 1 };
    expect(resolveCharacterSkillId('Enchant Fire')).toBe(52);
    expect(getSkillFilter(stat)).toMatchObject({ property: 'item_singleskill', params: [52], value: 1 });
    assertQueryParity(stat, 'item_singleskill', [52], 1);
    expect(resolveCharacterSkillId('Cold Enchant')).toBe(40);
    expect(resolveCharacterSkillId('Shiver Armor')).toBe(50);
    expect(resolveCharacterSkillId('Lightning Mastery')).toBe(63);
  });
  // Exhaust the bundled canonical names, including the explicit PD2 rename alias.
  it.each(Object.entries(skillNameToIdMap).map(([name, skill]) => [name, skill.id] as const))(
    'single skill %s resolves to %i in the row, URL and both market views',
    (skill, id) => {
      const stat: Stat = { stat_id: 107, name: `+2 to ${skill}`, skill, value: 2 };
      expect(getSkillFilter(stat)).toMatchObject({ property: 'item_singleskill', params: [id] });
      assertQueryParity(stat, 'item_singleskill', [id], 1);
    },
  );

  it.each(Object.values(classSkillsMap))('class bonus $name keeps class id $id', ({ name, id }) => {
    assertQueryParity({ stat_id: 83, name: `+2 to ${name}`, skill: name, value: 2 }, 'item_addclassskills', [id], 1);
  });

  it.each([...Object.values(classSubSkillMap), ...Object.values(classSubSkillMap2)])(
    'skill tab $name keeps tab $id',
    ({ name, id }) => {
      assertQueryParity(
        { stat_id: 188, name: `+2 to ${name}`, skill: name, value: 2 },
        'item_addskill_tab',
        [getSkillTabIndex(id)],
        1,
      );
    },
  );

  it.each([195, 196, 197, 198, 199, 200, 201, 202, 203, 205])(
    'trigger %i pins level and skill before chance',
    (stat_id) => {
      const stat: Stat = {
        stat_id,
        name: '17% Chance to cast level 12 Fire Ball on attack',
        skill: 'Fire Ball',
        level: 12,
        chance: 17,
        value: 99,
      };
      const filter = getSkillFilter(stat)!;
      expect(filter).toMatchObject({ params: [12, 47], valueIndex: 2, value: 17 });
      expect(normalizeSkillStat(stat).value).toBe(17);
      assertQueryParity(stat, filter.property, [12, 47], 2);
    },
  );

  it.each(['Wake of Fire', 'Wake of Fire Sentry'])('accepts verified Wake of Fire alias %s', (skill) => {
    expect(resolveCharacterSkillId(skill)).toBe(262);
  });
  it.each(['Wake of Inferno', 'Inferno Sentry'])('accepts verified Wake of Inferno alias %s', (skill) => {
    expect(resolveCharacterSkillId(skill)).toBe(272);
  });
  it.each(['Claw Mastery', 'Claw and Dagger Mastery', '利爪与匕首精通'])('recognizes %s as skill 252', (skill) => {
    assertQueryParity({ name: `+2 to ${skill}`, skill, value: 2 }, 'item_singleskill', [252], 1);
  });

  it('accepts the actual user Katar clipboard data without changing the original object', () => {
    const stat: Stat = { name: '+2 to Claw and Dagger Mastery', skill: 'Claw and Dagger Mastery', value: 2 };
    expect(getSkillFilter(stat)).toMatchObject({ params: [252], value: 2 });
    expect(normalizeSkillStat(stat).stat_id).toBe(107);
    expect(stat.stat_id).toBeUndefined();
    assertQueryParity(stat, 'item_singleskill', [252], 1);
  });

  it.each([97, 107])('preserves modifier %i rather than guessing its bonus kind', (stat_id) => {
    const property = stat_id === 97 ? 'item_nonclassskill' : 'item_singleskill';
    assertQueryParity({ stat_id, name: '+2 to Teleport', skill: 'Teleport', value: 2 }, property, [54], 1);
  });
  it('uses an explicit Oskill marker when stat_id is absent', () => {
    assertQueryParity({ name: '+2 to Teleport (Oskill)', skill: 'Teleport', value: 2 }, 'item_nonclassskill', [54], 1);
  });
  it('can extract a known direct skill name when the skill field is absent', () => {
    assertQueryParity({ stat_id: 107, name: '+2 to Blizzard (Sorceress Only)', value: 2 }, 'item_singleskill', [59], 1);
  });

  it('pins the aura skill id, then filters its level', () => {
    assertQueryParity(
      { stat_id: 151, name: 'Level 12 Conviction Aura When Equipped', skill: 'Conviction', level: 12 },
      'item_aura',
      [123],
      1,
    );
  });
  it('handles equipped skills with one parameter rather than treating them as chance-to-cast', () => {
    assertQueryParity(
      {
        stat_id: 191,
        name: 'Level 12 Energy Shield SelfAura When Equipped',
        skill: 'Energy Shield SelfAura',
        level: 12,
      },
      'item_skillonequip',
      [554],
      1,
    );
  });
  it('defaults an aura range to level rather than an unrelated value field', () => {
    expect(normalizeSkillStat({ stat_id: 151, name: 'Aura', skill: 'Conviction', level: 12, value: 1 }).value).toBe(12);
  });
  it('pins charged-skill level and skill before filtering its remaining uses', () => {
    const stat: Stat = {
      stat_id: 204,
      name: 'Level 20 Teleport (3/27 Charges)',
      skill: 'Teleport',
      level: 20,
      value: 3,
    };
    assertQueryParity(stat, 'item_charged_skill', [20, 54], 2);
    expect(normalizeSkillStat(stat).value).toBe(3);
    expect(getStatKey(stat)).toBe(getStatKey({ ...stat, name: 'Level 20 Teleport (27/27 Charges)', value: 27 }));
  });
  it('agrees with the actual public PD2 charged-skill listing encoding', () => {
    // Public /market/listing response checked on 2026-10-24. No account data.
    const modifier = {
      name: 'item_charged_skill',
      label: 'Level 1 Teleport (10/22 Charges)',
      values: [1, 54, 10, 22],
      priority: 1,
    };
    const stat: Stat = { stat_id: 204, name: modifier.label };
    expect(getSkillFilter(stat)).toMatchObject({ params: [1, 54], valueIndex: 2, value: 10 });
    expect(readStatValue([modifier], 'item_charged_skill{1,54}')).toBe(10);
    assertQueryParity(stat, 'item_charged_skill', [1, 54], 2);
  });
  it.each([
    [{ stat_id: 151, name: 'Level 12 Conviction Aura When Equipped' }, 'item_aura', [123], [123, 12], 12],
    [
      { stat_id: 198, name: '25% Chance to cast level 20 Chain Lightning on striking' },
      'item_skillonhit',
      [20, 53],
      [20, 53, 25],
      25,
    ],
    [{ stat_id: 363, name: '+3 to Fire Skills', value: 3 }, 'item_elemskill_fire', [], [0, 3], 3],
  ] as const)('matches a verified public market modifier: %o', (stat, property, params, values, value) => {
    const filter = getSkillFilter(stat)!;
    expect(filter).toMatchObject({ property, params, value });
    const key = params.length ? `${property}{${params.join(',')}}` : property;
    expect(readStatValue([{ name: property, label: stat.name, values: [...values], priority: 1 }], key)).toBe(value);
    assertQueryParity(stat, property, [...params], filter.valueIndex);
  });

  it.each([
    ['cold', 362],
    ['fire', 363],
    ['lightning', 364],
    ['poison', 365],
    ['magic', 366],
  ] as const)('global %s skill bonuses filter the amount at values.1', (element, stat_id) => {
    assertQueryParity({ stat_id, name: `to ${element} Skills`, value: 2 }, `item_elemskill_${element}`, [], 1);
  });
  it('resolves legacy elemental stat 126 from its explicit label', () => {
    assertQueryParity({ stat_id: 126, name: '+2 to Fire Skills', value: 2 }, 'item_elemskill_fire', [], 1);
  });
  it('recognizes a skill-tree class suffix ending in Only without fuzzy matching', () => {
    assertQueryParity(
      { stat_id: 188, name: '+2 to Fire Skills (Sorceress Only)', skill: 'Fire Skills (Sorceress Only)', value: 2 },
      'item_addskill_tab',
      [8],
      1,
    );
  });
  it('uses the explicit misspelled Assassin tree from the game instead of the unrelated display label', () => {
    const stat: Stat = {
      name: '+%d to Javelin and Spear Skills',
      skill: 'Shadow Desciplines (Assassin)',
      value: 1,
    };
    expect(getSkillFilter(stat)).toMatchObject({ property: 'item_addskill_tab', params: [49], value: 1 });
    expect(normalizeSkillStat(stat).name).toBe('Shadow Disciplines (Assassin)');
    assertQueryParity(stat, 'item_addskill_tab', [49], 1);
  });
  it('uses the class qualifier to disambiguate a display alias shared with a proc', () => {
    assertQueryParity(
      { stat_id: 107, name: '+2 to Amplify Damage (Necromancer Only)', skill: 'Amplify Damage', value: 2 },
      'item_singleskill',
      [66],
      1,
    );
  });
  it.each([
    { name: '17% Chance to cast level 12 Fire Ball on attack' },
    { name: 'Level 12 Conviction Aura When Equipped' },
    { name: 'Level 20 Teleport (3/27 Charges)' },
  ] as Stat[])('recovers explicit formatted skill data from the label: $name', (stat) => {
    const filter = getSkillFilter(stat)!;
    expect(filter).toBeDefined();
    assertQueryParity(stat, filter.property, filter.params, filter.valueIndex);
  });
  it('keeps a selected skill in the website search even with both range inputs blank', () => {
    const stat = { stat_id: 107, name: '+2 to Teleport', skill: 'Teleport', value: 2 };
    const key = getStatKey(stat);
    const url = new URL(buildTradeUrl(itemWith([stat]), mapped, new Set([key]), {}, settings));
    expect(url.searchParams.get('properties[item_singleskill{54}][min]')).toBe('0');
  });
  it('accepts a proc printf label with explicit numeric fields but no modifier id', () => {
    const stat: Stat = {
      name: '%d%% Chance to cast level %d %s on striking',
      skill: 'Fire Ball',
      level: 12,
      chance: 17,
    };
    assertQueryParity(stat, 'item_skillonhit', [12, 47], 2);
  });
  it('drops an unrelated source-value range when it differs from remaining uses', () => {
    expect(
      normalizeSkillStat({
        stat_id: 204,
        name: 'Level 20 Teleport (3/27 Charges)',
        skill: 'Teleport',
        level: 20,
        value: 20,
        range: { min: 1, max: 5 },
      }).range,
    ).toBeUndefined();
  });
});

describe('unresolved skill data stays unavailable instead of broadening a search', () => {
  it.each([
    { stat_id: 107, name: '+2 to Telepor', skill: 'Telepor', value: 2 },
    { stat_id: 188, name: 'Fire Skills', skill: 'Fire Skills', value: 2 },
    { stat_id: 188, name: 'Combat Skills', skill: 'Combat Skills', value: 2 },
    { stat_id: 195, name: 'Chance to cast', skill: 'Fire Ball', value: 2 },
    { stat_id: 195, name: 'Chance to cast', skill: 'Fire Ball', level: 0, value: 2 },
    { stat_id: 195, name: 'Chance to cast', skill: 'Not A Skill', level: 12, value: 2 },
    { stat_id: 195, name: 'Chance to cast', skill: 'Fire Ball', level: Infinity, value: 2 },
    { stat_id: 195, name: 'Chance to cast', skill: 'Fire Ball', level: 12, chance: NaN },
    { stat_id: 151, name: 'Aura', skill: 'Conviction' },
    { stat_id: 204, name: 'Charged Skill', skill: 'Teleport', value: 3 },
    { stat_id: 204, name: 'Level 20 Teleport (28/27 Charges)', skill: 'Teleport', level: 20 },
    { stat_id: 126, name: 'Elemental Skills', value: 2 },
    { name: 'Level %d Conviction Aura When Equipped', skill: 'Conviction', value: 12 },
    { name: 'Level %d Teleport (%d/%d Charges)', skill: 'Teleport', value: 20 },
  ] as Stat[])('rejects incomplete or ambiguous skill $name ($stat_id)', (stat) => {
    expect(isSkillStat(stat)).toBe(true);
    expect(getSkillFilter(stat)).toBeUndefined();
    expect(skillFilterUnavailableReason(stat)).toEqual(expect.any(String));
    const item = itemWith([stat]);
    const key = getStatKey(stat);
    const selected = new Set([key]);
    const filters = { [key]: { min: '2' } };
    expect(buildGetMarketListingQuery(item, mapped, selected, filters, settings)['item.modifiers']).toBeUndefined();
    const url = new URL(buildTradeUrl(item, mapped, selected, filters, settings));
    expect([...url.searchParams.keys()].some((key) => key.startsWith('properties['))).toBe(false);
  });

  it('does not share state across bonus kinds, trigger conditions, levels or corruption', () => {
    const sameName: Stat[] = [
      { stat_id: 107, name: '+2 Teleport', skill: 'Teleport', value: 2 },
      { stat_id: 97, name: '+2 Teleport', skill: 'Teleport', value: 2 },
      { stat_id: 107, name: '+2 Teleport', skill: 'Teleport', value: 2, corrupted: true },
      { stat_id: 195, name: 'CtC Teleport', skill: 'Teleport', level: 12, chance: 2 },
      { stat_id: 198, name: 'CtC Teleport', skill: 'Teleport', level: 12, chance: 2 },
      { stat_id: 198, name: 'CtC Teleport', skill: 'Teleport', level: 13, chance: 2 },
      { stat_id: 204, name: 'Level 20 Teleport (3/27 Charges)', skill: 'Teleport', level: 20 },
    ];
    expect(new Set(sameName.map(getStatKey)).size).toBe(sameName.length);
  });
});
