import { describe, expect, it } from 'vitest';
import { searchStats, STAT_OPTIONS, isCorruption } from './stats';
import { localizePd2Text } from '@/lib/localize-pd2-text';
import { CORRUPTION_OPTIONS } from './catalog';

const top = (query: string, n = 2) =>
  searchStats(query, n).map((o) => ('label' in o ? o.label : '').replace(/\{X\}/g, 'X'));

describe('searchStats ranking', () => {
  it('puts whole-name matches first, the pseudo total ahead of the plain property', () => {
    expect(top('life')).toEqual(['+X Total Life (incl. 2 per Vitality)', '+X to Life']);
    expect(top('mana')).toEqual(['+X Total Mana (incl. 2 per Energy)', '+X to Mana']);
    expect(top('cold res', 1)).toEqual(['+X% Total Cold Resistance']);
    expect(top('all res', 1)).toEqual(['+X% All Resistances (lowest of the four)']);
  });

  it('prefers shorter names among partial matches, and short words must match whole words', () => {
    expect(top('def')).toEqual(['+X Defense', '+X Defense (Based on Character Level)']);
    expect(top('life', 5).indexOf('+X% Total Life Stolen per Hit')).toBeGreaterThan(1);
  });
});

describe('Chinese property search', () => {
  it('finds both summoning skill trees using the reported two-character query', () => {
    const result = searchStats('召唤', 120);
    expect(result).toContain(STAT_OPTIONS.find((s) => s.key === 'item_addskill_tab{18}'));
    expect(result).toContain(STAT_OPTIONS.find((s) => s.key === 'item_addskill_tab{40}'));
    expect(result.some((s) => 'key' in s && s.key === 'item_singleskill{247}')).toBe(true);
  });

  it('supports Chinese fragments, multiple words, mixed language and existing abbreviations', () => {
    const keys = (q: string) => searchStats(q, 120).map((s) => 'key' in s ? s.key : 'id' in s ? s.id : s.value);
    expect(keys('死灵 召唤')).toContain('item_addskill_tab{18}');
    expect(keys('Necromancer 召唤')).toContain('item_addskill_tab{18}');
    expect(keys('召唤 Summoning')).toContain('item_addskill_tab{40}');
    expect(keys('力量')).toContain('strength');
    expect(keys('攻速')).toContain('item_fasterattackrate');
    expect(keys('施法速度')).toEqual(keys('fcr'));
    expect(keys('ＦＣＲ')).toEqual(keys('fcr'));
    expect(keys('不存在的词条abcdefgh')).toEqual([]);
  });

  it('matches every translated catalogue label without changing its original key or label', () => {
    let checked = 0;
    for (const option of STAT_OPTIONS) {
      const label = localizePd2Text(option.label).replace(/\{X\}/g, ' ').trim();
      if (!/[\u3400-\u9fff]/u.test(label)) continue;
      const hits = searchStats(label, 2000);
      expect(hits, option.key + ' ' + label).toContain(option);
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('finds Chinese corruption terms while retaining the original corruption key', () => {
    const hits = searchStats('腐化 施法', 120, CORRUPTION_OPTIONS);
    expect(hits.some((s) => isCorruption(s) && s.value === 'item_fastercastrate')).toBe(true);
  });
});
