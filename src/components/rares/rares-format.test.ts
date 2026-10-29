import { describe, expect, it } from 'vitest';
import type { AppraisedStat, RareAppraisal } from '@/lib/rare-appraisal-api';
import {
  bandRange,
  compareStash,
  fmtBandHr,
  hardcoreNote,
  isLowValue,
  isWorthALook,
  keyStats,
  locationText,
  marketBandText,
  marketSource,
  ordinalPercentile,
  plural,
  RANK_BLOCKS,
  rankBlockIndex,
  rankedStats,
  rankText,
  starsText,
  starTitle,
  stashPositionText,
  statNotes,
} from './rares-format';

function stat(over: Partial<AppraisedStat>): AppraisedStat {
  return {
    label: 'stat',
    key: null,
    value: null,
    stars: null,
    multiplier: null,
    roll: null,
    keyFrom: null,
    corrupted: false,
    ...over,
  };
}

function rare(over: Partial<RareAppraisal> = {}): RareAppraisal {
  return {
    id: 'abc',
    name: 'Grim Loop',
    baseName: 'Ring',
    slot: 'ring',
    tab: 'Shared 1',
    position: { column: 4, row: 0 },
    verdict: 'check',
    checkPriority: null,
    rank: 0.5,
    rankError: 0.05,
    stats: [],
    market: null,
    modelMode: 'softcore',
    modelVersion: 'v1',
    ...over,
  };
}

const market = (over: Partial<NonNullable<RareAppraisal['market']>> = {}): NonNullable<RareAppraisal['market']> => ({
  lowHr: 1.5,
  highHr: 3.2,
  source: 'current',
  sampleSize: 40,
  mode: 'softcore',
  ...over,
});

describe('rankText', () => {
  it('reads high ranks as "top" and low ranks as "bottom"', () => {
    expect(rankText(0.92)).toBe('排名前 8%');
    expect(rankText(0.12)).toBe('排名后 12%');
    expect(rankText(0.5)).toBe('排名前 50%');
    expect(rankText(0.49)).toBe('排名后 49%');
  });

  it('never prints 0%', () => {
    expect(rankText(1)).toBe('排名前 1%');
    expect(rankText(0.999)).toBe('排名前 1%');
    expect(rankText(0)).toBe('排名后 1%');
  });
});

describe('rankBlockIndex', () => {
  it('lights the block that matches the rounded rankText across the whole range', () => {
    for (let i = 0; i <= 1000; i++) {
      const rank = i / 1000;
      const [, dir, pctText] = /^排名(前|后) (\d+)%$/.exec(rankText(rank))!;
      const pct = Number(pctText);
      const idx = rankBlockIndex(rank);
      const [blockDir, blockPctText] = RANK_BLOCKS[idx].label.split(' ');
      const blockPct = parseInt(blockPctText, 10);
      expect(blockDir, `rank ${rank}`).toBe(dir);
      // The block is the tightest one containing the printed percentage.
      expect(pct, `rank ${rank}`).toBeLessThanOrEqual(blockPct);
      const tighter = RANK_BLOCKS.filter((b) => b.label.startsWith(dir)).map((b) => parseInt(b.label.split(' ')[1], 10));
      expect(tighter.filter((p) => p >= pct && p < blockPct), `rank ${rank}`).toEqual([]);
    }
  });

  it('puts the rounding edge .75 into "top 25%" as the doc promises', () => {
    expect(RANK_BLOCKS[rankBlockIndex(0.75)].label).toBe('前 25%');
    expect(RANK_BLOCKS[rankBlockIndex(0.95)].label).toBe('前 5%');
    expect(RANK_BLOCKS[rankBlockIndex(0.25)].label).toBe('后 25%');
  });
});

describe('ordinalPercentile', () => {
  it.each([
    [0.01, '1%'],
    [0.02, '2%'],
    [0.03, '3%'],
    [0.04, '4%'],
    [0.11, '11%'],
    [0.12, '12%'],
    [0.13, '13%'],
    [0.21, '21%'],
    [0.72, '72%'],
    [0.93, '93%'],
    [0, '0%'],
    [1, '100%'],
  ])('%s → %s', (rank, text) => {
    expect(ordinalPercentile(rank)).toBe(text);
  });
});

describe('stars and key stat titles', () => {
  it('renders one star per level and none for null', () => {
    expect(starsText(3)).toBe('★★★');
    expect(starsText(null)).toBe('');
  });

  it('prefers the exact multiplier, then the star range', () => {
    expect(starTitle(stat({ stars: 2, multiplier: 2.46 }))).toBe('关键词条：该词条对这一等级后期赛季价格的影响系数为 ×2.5');
    expect(starTitle(stat({ stars: 3 }))).toBe('关键词条：该词条对这一等级后期赛季价格的影响系数为 ×4+');
  });
});

describe('price bands', () => {
  it('formats HR with magnitude-appropriate precision', () => {
    expect(fmtBandHr(0.04)).toBe('0.04');
    expect(fmtBandHr(0.999)).toBe('1.00');
    expect(fmtBandHr(1)).toBe('1.0');
    expect(fmtBandHr(9.94)).toBe('9.9');
    expect(fmtBandHr(10)).toBe('10');
    expect(fmtBandHr(12.6)).toBe('13');
  });

  it('collapses a band whose ends format identically', () => {
    expect(bandRange(1.5, 3.2)).toBe('1.5–3.2');
    expect(bandRange(1.01, 1.04)).toBe('1.0');
    expect(bandRange(0.5, 12)).toBe('0.50–12');
  });

  it('describes the market band and where it comes from', () => {
    expect(marketBandText(rare())).toBeNull();
    expect(marketSource(rare())).toBeNull();
    expect(marketBandText(rare({ market: market() }))).toBe('~1.5–3.2 HR');
    expect(marketSource(rare({ slot: 'circ', market: market() }))).toBe('同排名头环 · S13 赛季');
    expect(marketSource(rare({ market: market({ source: 'last-season', mode: 'hardcore' }) }))).toBe(
      '同排名戒指 · 上赛季',
    );
    expect(marketSource(rare({ market: market({ mode: 'hardcore' }) }))).toBe('同排名戒指 · 专家模式挂单');
  });
});

describe('statNotes', () => {
  it('tags corruption-only key stats with the short stat name', () => {
    expect(
      statNotes(stat({ stars: 2, corruptionOnly: true, key: 'item_fastercastrate__x', value: 20 }), 'ring'),
    ).toEqual({ tag: 'C', note: '20 FCR 仅能通过腐化出现在戒指上' });
  });

  it('falls back to the stat label without a short name or value', () => {
    expect(statNotes(stat({ stars: 1, corruptionOnly: true, key: 'item_unknown', label: '+1 Foo' }), 'amul')).toEqual({
      tag: 'C',
      note: '+1 Foo 仅能通过腐化出现在项链上',
    });
    expect(
      statNotes(stat({ stars: 1, corruptionOnly: true, key: 'item_magicbonus', value: null, label: 'MF' }), 'boot'),
    ).toEqual({ tag: 'C', note: 'MF 仅能通过腐化出现在靴子上' });
  });

  it('describes near misses with or without the tier multiplier', () => {
    expect(statNotes(stat({ keyFrom: 20, keyFromMultiplier: 2.04 }), 'amul')).toEqual({
      tag: '↑20',
      note: '词条达到 20+ 时在项链上可达关键价值（系数 ×2.0）',
    });
    expect(statNotes(stat({ keyFrom: 10, corruptionOnly: true }), 'glov')).toEqual({
      tag: '↑10',
      note: '10+ 以上的词条在手套上具有价值（仅能通过腐化获得）',
    });
  });

  it('has no note for plain stats or regular key stats', () => {
    expect(statNotes(stat({}), 'ring')).toEqual({ tag: null, note: null });
    expect(statNotes(stat({ stars: 2, keyFrom: 5 }), 'ring')).toEqual({ tag: null, note: null });
  });

  it('treats keyFrom 0 as a near miss (not as missing)', () => {
    expect(statNotes(stat({ keyFrom: 0 }), 'ring').tag).toBe('↑0');
  });
});

describe('stat ordering', () => {
  const plain1 = stat({ label: 'plain1' });
  const nearSmall = stat({ label: 'nearSmall', keyFrom: 5, keyFromMultiplier: 1.5 });
  const oneStarBig = stat({ label: 'oneStarBig', stars: 1, multiplier: 1.9 });
  const plain2 = stat({ label: 'plain2' });
  const threeStar = stat({ label: 'threeStar', stars: 3, multiplier: 5 });
  const nearBig = stat({ label: 'nearBig', keyFrom: 5, keyFromMultiplier: 3 });
  const oneStarSmall = stat({ label: 'oneStarSmall', stars: 1, multiplier: 1.3 });
  const r = rare({ stats: [plain1, nearSmall, oneStarBig, plain2, threeStar, nearBig, oneStarSmall] });

  it('ranks key stats (strongest first), then near misses, then the rest in game order', () => {
    expect(rankedStats(r).map((s) => s.label)).toEqual([
      'threeStar',
      'oneStarBig',
      'oneStarSmall',
      'nearBig',
      'nearSmall',
      'plain1',
      'plain2',
    ]);
  });

  it('keyStats keeps only starred stats, strongest first, without mutating the item', () => {
    expect(keyStats(r).map((s) => s.label)).toEqual(['threeStar', 'oneStarBig', 'oneStarSmall']);
    expect(r.stats[0]).toBe(plain1);
  });
});

describe('hardcoreNote', () => {
  it('is null on softcore', () => {
    expect(hardcoreNote(rare({ rankReference: 'hardcore' }), false)).toBeNull();
  });

  it('describes the rank reference and price listings on hardcore', () => {
    expect(hardcoreNote(rare({ rankReference: 'hardcore', market: market({ mode: 'hardcore' }) }), true)).toBe(
      '专家模式：价格模型和星级建议基于普通模式数据；排名参照专家模式挂单；价格参考专家模式挂单',
    );
    expect(hardcoreNote(rare({ rankReference: 'blended', rankReferenceWeight: 0.426 }), true)).toBe(
      '专家模式：价格模型和星级建议基于普通模式数据；排名综合参考专家模式与普通模式挂单（专家模式占 43%）',
    );
    expect(hardcoreNote(rare({ market: market() }), true)).toBe(
      '专家模式：价格模型和星级建议基于普通模式数据；排名参照普通模式挂单；价格参考普通模式挂单',
    );
  });

  it('treats a missing blend weight as 0%', () => {
    expect(hardcoreNote(rare({ rankReference: 'blended' }), true)).toContain('（专家模式占 0%）');
  });
});

describe('check classification', () => {
  it('splits check items by priority; keep/vendor are neither', () => {
    expect(isWorthALook(rare({ checkPriority: 'high' }))).toBe(true);
    expect(isWorthALook(rare({ checkPriority: 'medium' }))).toBe(true);
    expect(isWorthALook(rare({ checkPriority: 'low' }))).toBe(false);
    expect(isLowValue(rare({ checkPriority: 'low' }))).toBe(true);
    expect(isLowValue(rare({ checkPriority: null }))).toBe(true);
    for (const verdict of ['keep', 'vendor'] as const) {
      expect(isWorthALook(rare({ verdict, checkPriority: 'high' }))).toBe(false);
      expect(isLowValue(rare({ verdict }))).toBe(false);
    }
  });
});

describe('location texts', () => {
  it('skips the slot when it equals the base name and drops a missing tab', () => {
    expect(locationText(rare())).toBe('Ring · Shared 1');
    expect(locationText(rare({ baseName: '戒指' }))).toBe('戒指 · Shared 1');
    expect(locationText(rare({ baseName: 'War Belt', slot: 'belt' }))).toBe('War Belt · 腰带 · Shared 1');
    expect(locationText(rare({ baseName: 'Tiara', slot: 'circ', tab: null }))).toBe('Tiara · 头环');
  });

  it('shows 0-based grid positions 1-based, and null when nothing is known', () => {
    expect(stashPositionText(rare())).toBe('Shared 1 · col 5, row 1');
    expect(stashPositionText(rare({ tab: null }))).toBe('col 5, row 1');
    expect(stashPositionText(rare({ position: null }))).toBe('Shared 1');
    expect(stashPositionText(rare({ tab: null, position: null }))).toBeNull();
  });
});

describe('compareStash', () => {
  it('orders by tab (numeric-aware), then row, then column, unpositioned last', () => {
    const items = [
      rare({ id: 'p10', tab: 'Shared 10', position: { column: 0, row: 0 } }),
      rare({ id: 'none', tab: 'Shared 2', position: null }),
      rare({ id: 'r1c0', tab: 'Shared 2', position: { column: 0, row: 1 } }),
      rare({ id: 'r0c3', tab: 'Shared 2', position: { column: 3, row: 0 } }),
      rare({ id: 'r0c1', tab: 'Shared 2', position: { column: 1, row: 0 } }),
    ];
    expect([...items].sort(compareStash).map((r) => r.id)).toEqual(['r0c1', 'r0c3', 'r1c0', 'none', 'p10']);
  });

  it('treats two unpositioned items in a tab as equal', () => {
    expect(compareStash(rare({ position: null }), rare({ position: null }))).toBe(0);
  });
});

describe('plural', () => {
  it('pluralises everything but one', () => {
    expect(plural(1, 'rare')).toBe('1 rare');
    expect(plural(0, 'rare')).toBe('0 rares');
    expect(plural(2, 'rare')).toBe('2 rares');
  });
});
