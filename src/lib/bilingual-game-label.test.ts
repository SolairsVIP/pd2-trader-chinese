import { describe, expect, it } from 'vitest';
import { normalizeGameItemInput } from './game-item-input';
import { normalizeItemForStashMatching } from './game-stash-input';
import { clipboardContainsValidItem } from './item-utils';
import { getSkillFilter, resolveCharacterSkillId } from '@/pages/price-check/lib/skill-stats';
import { buildGetMarketListingQuery } from '@/pages/price-check/lib/tradeUrlBuilder';
import { getStatKey } from '@/pages/price-check/lib/utils';

const tombsong = {
  iLevel: 85,
  name: 'Tombsong',
  quality: 'Unique',
  quantity: 187,
  type: '精良箭矢 Sharp Arrows',
  stats: [
    { name: '穿刺几率', stat_id: 156, value: 20, range: { min: 20, max: 40 } },
    { name: '对不死生物的伤害', stat_id: 122, value: 87, range: { min: 50, max: 100 } },
    { name: '对抗不死生物的攻击准确率', stat_id: 124, value: 164, range: { min: 125, max: 175 } },
    { name: '+12 to 复生骷髅弓箭手 Raise Skeleton Archer', skill: '复生骷髅弓箭手 Raise Skeleton Archer', value: 12 },
    { name: '诅咒抗性', stat_id: 504, value: 20 },
    { name: '个额外的骷髅弓箭手', stat_id: 475, value: 4 },
    { name: '最大伤害值', stat_id: 22, value: 10 },
    { name: '一股邪恶力量', stat_id: 160, value: 10 },
  ],
};

describe('complete bilingual client labels', () => {
  it.each([
    ['精良箭矢 Sharp Arrows', '复生骷髅弓箭手 Raise Skeleton Archer'],
    ['绮捐壇绠煝 Sharp Arrows', '澶嶇敓楠烽珔寮撶鎵?Raise Skeleton Archer'],
    ['精良箭矢 (Sharp Arrows)', '复生骷髅弓箭手 (Raise Skeleton Archer)'],
    ['精良箭矢 Sharp Arrows', '復生骷髏弓箭手 Raise Skeleton Archer'],
  ])('accepts Tombsong with %s and %s through capture, stash and query', (type, skill) => {
    const source = {
      ...tombsong,
      type,
      stats: tombsong.stats.map((s) => (s.skill ? { ...s, name: `+12 to ${skill}`, skill } : s)),
    };
    const normalized = normalizeGameItemInput(JSON.stringify(source));
    expect(normalized.error).toBeUndefined();
    expect(clipboardContainsValidItem(normalized.text!)).toBe(true);
    const item = JSON.parse(normalized.text!);
    expect(item).toMatchObject({ name: 'Tombsong', type: 'Sharp Arrows', iLevel: 85, quantity: 187 });
    expect(item.stats.map((s: { value: number }) => s.value)).toEqual([20, 87, 164, 12, 20, 4, 10, 10]);
    expect(item.stats[0].range).toEqual({ min: 20, max: 40 });
    expect(item.stats[3].skill).toBe('Raise Skeleton Archer');
    expect(getSkillFilter(item.stats[3])?.params).toEqual([89]);
    expect(normalizeItemForStashMatching(item)).toEqual(item);
    const query = buildGetMarketListingQuery(
      item,
      undefined,
      new Set([getStatKey(item.stats[0])]),
      {},
      { mode: 'softcore', ladder: 'ladder' },
    );
    expect(query['item.name']).toEqual({ $regex: 'Tombsong', $options: 'i' });
    expect(query['item.modifiers']).toEqual({ $all: [{ $elemMatch: { name: 'item_pierce' } }] });
  });

  it.each(['翼盔 (Winged Helm)', '双手剑 Two-Handed Sword', '雙手劍 Two-Handed Sword'])(
    'canonicalizes catalogue spelling without false ambiguity: %s',
    (type) => {
      const result = normalizeGameItemInput(JSON.stringify({ iLevel: 80, quality: 'Normal', type }));
      expect(result.error).toBeUndefined();
      expect(JSON.parse(result.text!).type).toBe(type.includes('Winged') ? 'Winged Helm' : 'Two-Handed Sword');
    },
  );

  it.each(['复生骷髅弓箭手 Raise Skeleton Archer', '复生骷髅弓箭手(Raise Skeleton Archer)'])(
    'resolves the full English skill suffix: %s',
    (skill) => {
      expect(resolveCharacterSkillId(skill)).toBe(89);
    },
  );

  it('preserves an explicit oskill qualifier on a bilingual skill field', () => {
    const result = normalizeGameItemInput(
      JSON.stringify({
        iLevel: 85,
        quality: 'Unique',
        name: 'Tombsong',
        type: '精良箭矢 Sharp Arrows',
        stats: [{ name: '+12 to 复生骷髅弓箭手', skill: '复生骷髅弓箭手 Raise Skeleton Archer (Oskill)', value: 12 }],
      }),
    );
    expect(result.error).toBeUndefined();
    expect(getSkillFilter(JSON.parse(result.text!).stats[0])).toMatchObject({
      property: 'item_nonclassskill',
      params: [89],
      value: 12,
    });
  });

  it.each(['火球 Teleport', '中文 some text Teleport', '中文 Telepor', '中文 Teleport extra'])(
    'does not guess conflicting or partial skills: %s',
    (skill) => {
      expect(resolveCharacterSkillId(skill)).toBeUndefined();
    },
  );

  it('rejects a conflicting known base and leaves broken JSON unrepaired', () => {
    expect(
      normalizeGameItemInput(JSON.stringify({ iLevel: 80, quality: 'Normal', type: '锁环甲 Sharp Arrows' })).error,
    ).toBeTruthy();
    const broken =
      '{"type":"精良箭矢 Sharp Arrows","quality":"Unique","iLevel":85,"stats":[{"name":"诅咒抗性?,"value":20}]}';
    expect(normalizeGameItemInput(broken).text).toBe(broken);
    expect(clipboardContainsValidItem(broken)).toBe(false);
  });

  it('supports Traditional Chinese charge labels without changing remaining/capacity', () => {
    const result = normalizeGameItemInput(
      JSON.stringify({
        iLevel: 80,
        quality: 'Unique',
        name: 'Wisp',
        type: '戒指',
        stats: [{ skill: '狼獾之心 (Heart of Wolverine)', level: 2, charges: '(11/13 聚氣)' }],
      }),
    );
    expect(result.error).toBeUndefined();
    expect(getSkillFilter(JSON.parse(result.text!).stats[0])).toMatchObject({
      property: 'item_charged_skill',
      params: [2, 236],
      value: 11,
    });
  });
});
