/**
 * Formatting + text helpers for appraised rares (price-check rare card, Net Worth "Rares" tab).
 * Same wording as the pd2trader.com Net Worth view (client/src/components/wealth/rares/raresFormat.js).
 */
import type { AppraisedStat, CraftRecipe, RareAppraisal, RareSlot, Stars, Verdict } from '@/lib/rare-appraisal-api';

/** Season the model's asking prices come from (shown on the "est." hint). */
export const MODEL_SEASON = 'S13';

export const RECIPE_LABELS: Record<CraftRecipe, string> = {
  blood: '血系手工制作',
  caster: '施法者手工制作',
  hitpower: '击退手工制作',
  safety: '安全手工制作',
  vampiric: '吸血手工制作',
  bountiful: '丰饶手工制作',
  brilliant: '灿烂手工制作',
};

export const isCrafted = (rare: Pick<RareAppraisal, 'quality'>): boolean => rare.quality === 'Crafted';

/** Item-name colour class by quality (older servers send no quality: rare). */
export const appraisalNameClass = (rare: Pick<RareAppraisal, 'quality'>): string =>
  isCrafted(rare) ? 'text-q-crafted' : 'text-q-rare';

export const LOW_CONFIDENCE_TITLE = '可信度较低：此类手工物品的估价依据有限，请将建议和价格范围作为参考。';

/**
 * Text for a null appraisal's `reason`. Crafted gate-off reasons ("crafted slot unreliable: <backtest detail>")
 * become a plain sentence (detail stays in the hover title); every other reason is shown verbatim, as before.
 */
export function appraisalNote(reason: string): { text: string; title?: string } {
  if (reason.startsWith('crafted slot unreliable')) {
    return {
      text: '此部位的手工物品暂时无法可靠估价（相关数据不足）。',
      title: reason,
    };
  }
  return { text: reason };
}

export const SLOT_LABELS: Record<RareSlot, string> = {
  ring: '戒指',
  amul: '项链',
  circ: '头环',
  jewl: '珠宝',
  glov: '手套',
  boot: '靴子',
  belt: '腰带',
  tors: '护甲',
  helm: '头盔',
  shield: '盾牌',
  quiver: '箭袋',
  weapon: '武器',
};

export const SLOT_PLURALS: Record<RareSlot, string> = {
  ring: '戒指',
  amul: '项链',
  circ: '头环',
  jewl: '珠宝',
  glov: '手套',
  boot: '靴子',
  belt: '腰带',
  tors: '护甲',
  helm: '头盔',
  shield: '盾牌',
  quiver: '箭袋',
  weapon: '武器',
};

export const VERDICT_LABELS: Record<Verdict, string> = { keep: '建议保留', check: '建议复核', vendor: '建议卖商店' };

/** Theme tokens (CSS/SVG), so every theme gets matching verdict colours. */
export const VERDICT_COLORS: Record<Verdict, string> = {
  keep: 'var(--success)',
  check: 'var(--warning)',
  vendor: 'var(--destructive)',
};

/** Tinted badge classes per verdict (same pattern as the delta pills). */
export const VERDICT_BADGE_CLASS: Record<Verdict, string> = {
  keep: 'border-success/40 bg-success/12 text-success',
  check: 'border-warning/40 bg-warning/12 text-warning',
  vendor: 'border-destructive/40 bg-destructive/12 text-destructive',
};

export const STAR_RANGES: Record<Stars, string> = { 1: '×1.25–2', 2: '×2–4', 3: '×4+' };

export const starsText = (n: Stars | null): string => '★'.repeat(n ?? 0);

/** "top 8%" for rank 0.92, "bottom 12%" for rank 0.12 (a low rank never reads as "top 88%"). Never 0%. */
export function rankText(rank: number): string {
  return rank >= 0.5
    ? `排名前 ${Math.max(1, Math.round((1 - rank) * 100))}%`
    : `排名后 ${Math.max(1, Math.round(rank * 100))}%`;
}

/** Ordinal percentile, e.g. 0.72 → "72nd". */
export function ordinalPercentile(rank: number): string {
  const n = Math.round(rank * 100);
  return `${n}%`;
}

/** Hover text for a starred stat: the multiplier stays out of the visible row. */
export function starTitle(stat: AppraisedStat): string {
  const m = stat.multiplier !== null ? `×${stat.multiplier.toFixed(1)}` : stat.stars ? STAR_RANGES[stat.stars] : '';
  return `关键词条：该词条对这一等级后期赛季价格的影响系数为 ${m}`;
}

/** HR with precision that suits the magnitude (0.04, 0.8, 3.5, 12). */
export function fmtBandHr(v: number): string {
  if (v >= 10) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

/** "1.5–3.2" for a band; one value when both ends format the same (asking prices cluster on 1, 0.5, 0.25…). */
export function bandRange(lowHr: number, highHr: number): string {
  const lo = fmtBandHr(lowHr);
  const hi = fmtBandHr(highHr);
  return lo === hi ? lo : `${lo}–${hi}`;
}

/** "~1.5–3.2 HR" for a rare's market band, null without one. */
export function marketBandText(rare: RareAppraisal): string | null {
  return rare.market ? `~${bandRange(rare.market.lowHr, rare.market.highHr)} HR` : null;
}

/** Sub-line under the "Usually listed" value: "circlets at this rank · S13" / "· last season" / "· hardcore listings". */
export function marketSource(rare: RareAppraisal): string | null {
  const m = rare.market;
  if (!m) return null;
  const where = m.source === 'last-season' ? '上赛季' : m.mode === 'hardcore' ? '专家模式挂单' : `${MODEL_SEASON} 赛季`;
  return `同排名${SLOT_PLURALS[rare.slot] ?? '物品'} · ${where}`;
}

/** Rank blocks (Blocks rank display): bottom 25% … top 5%, each [from, to) on the 0..1 percentile. */
export const RANK_BLOCKS: { label: string; from: number; to: number }[] = [
  { label: '后 25%', from: 0, to: 0.25 },
  { label: '后 50%', from: 0.25, to: 0.5 },
  { label: '前 50%', from: 0.5, to: 0.75 },
  { label: '前 25%', from: 0.75, to: 0.85 },
  { label: '前 15%', from: 0.85, to: 0.95 },
  { label: '前 5%', from: 0.95, to: 1 },
];

/**
 * Index of the rank block that holds `rank`, decided on the same rounded "top X%" / "bottom X%" that
 * `rankText` prints, so the lit block never contradicts the verdict text (rank .75 → "top 25%" → top 25%).
 */
export function rankBlockIndex(rank: number): number {
  if (rank < 0.5) return Math.max(1, Math.round(rank * 100)) <= 25 ? 0 : 1;
  const top = Math.max(1, Math.round((1 - rank) * 100));
  return top <= 5 ? 5 : top <= 15 ? 4 : top <= 25 ? 3 : 2;
}

/** Short names for the corruption note ("20 FCR on rings only via corruption"); the stat label otherwise. */
const SHORT_STAT: Record<string, string> = {
  item_fastercastrate: 'FCR',
  item_fastermovevelocity: 'FRW',
  item_fastergethitrate: 'FHR',
  item_fasterattackrate: 'IAS',
  item_magicbonus: 'MF',
  item_allskills: '所有技能',
  item_crushingblow: 'CB',
  item_deadlystrike: 'DS',
  maxdamage_percent: 'ED',
};

/**
 * Texts of one stat in the "Stats on this item" list: a compact `tag` ("C" corruption-only, "↑4" near miss)
 * whose full sentence is `note` (tooltip); both null when the stat needs no note.
 */
export function statNotes(stat: AppraisedStat, slot: RareSlot): { tag: string | null; note: string | null } {
  const slots = SLOT_PLURALS[slot] ?? '物品';
  const mult = (m: number) => `×${m.toFixed(1)}`;
  let tag: string | null = null;
  let note: string | null = null;
  if (stat.stars && stat.corruptionOnly) {
    const short = stat.key ? SHORT_STAT[stat.key.split('__')[0]] : undefined;
    tag = 'C';
    note = `${short && stat.value !== null ? `${stat.value} ${short}` : stat.label} 仅能通过腐化出现在${slots}上`;
  } else if (!stat.stars && stat.keyFrom !== null) {
    tag = `↑${stat.keyFrom}`;
    note =
      (stat.keyFromMultiplier
        ? `词条达到 ${stat.keyFrom}+ 时在${slots}上可达关键价值（系数 ${mult(stat.keyFromMultiplier)}）`
        : `${stat.keyFrom}+ 以上的词条在${slots}上具有价值`) + (stat.corruptionOnly ? '（仅能通过腐化获得）' : '');
  }
  return { tag, note };
}

/** "Stats on this item" order: key stats strongest first, then near misses, then the rest (in-game order). */
export function rankedStats(rare: RareAppraisal): AppraisedStat[] {
  const tier = (s: AppraisedStat) => (s.stars ? 0 : s.keyFrom !== null ? 1 : 2);
  return rare.stats
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        tier(a.s) - tier(b.s) ||
        (b.s.stars ?? 0) - (a.s.stars ?? 0) ||
        (b.s.multiplier ?? b.s.keyFromMultiplier ?? 0) - (a.s.multiplier ?? a.s.keyFromMultiplier ?? 0) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
}

/** Which listings a hardcore rank was taken against (server `rankReference`). */
function rankNote(rare: RareAppraisal): string {
  if (rare.rankReference === 'hardcore') return '排名参照专家模式挂单';
  if (rare.rankReference === 'blended') {
    const pct = Math.round(100 * (rare.rankReferenceWeight ?? 0));
    return `排名综合参考专家模式与普通模式挂单（专家模式占 ${pct}%）`;
  }
  return '排名参照普通模式挂单';
}

/**
 * Note for hardcore: the price model and stars are softcore-trained; the rank is taken against hardcore
 * listings (blended with softcore while HC listings are few); the price band comes from hardcore listings
 * when the slot has HC bands, else from softcore listings. Null on softcore.
 */
export function hardcoreNote(rare: RareAppraisal, hardcore: boolean): string | null {
  if (!hardcore) return null;
  const parts = ['专家模式：价格模型和星级建议基于普通模式数据', rankNote(rare)];
  if (rare.market) parts.push(`价格参考${rare.market.mode === 'hardcore' ? '专家模式' : '普通模式'}挂单`);
  return parts.join('；');
}

/** Starred stats, strongest first. */
export function keyStats(rare: RareAppraisal): AppraisedStat[] {
  return rare.stats
    .filter((s) => s.stars)
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.multiplier ?? 0) - (a.multiplier ?? 0));
}

/** "Worth a look": check items with a ★ key stat. Low-priority checks are folded away. */
export const isWorthALook = (r: RareAppraisal): boolean =>
  r.verdict === 'check' && (r.checkPriority === 'high' || r.checkPriority === 'medium');

/** Check items without a key stat ("likely low value"), folded per stash tab like vendor rares. */
export const isLowValue = (r: RareAppraisal): boolean => r.verdict === 'check' && !isWorthALook(r);

/** "War Belt · Belt · Shared 1" (row line; position is in the detail); the slot is skipped when it equals the base name (Ring, Jewel). */
export function locationText(rare: RareAppraisal): string {
  const slot = SLOT_LABELS[rare.slot] ?? rare.slot;
  return [rare.baseName, slot === rare.baseName ? null : slot, rare.tab].filter(Boolean).join(' · ');
}

/** "Shared 1 · col 5, row 1" (raw 0-based PD2 grid coordinates shown 1-based); null without a tab or position. */
export function stashPositionText(rare: RareAppraisal): string | null {
  const position = rare.position ? `col ${rare.position.column + 1}, row ${rare.position.row + 1}` : null;
  return [rare.tab, position].filter(Boolean).join(' · ') || null;
}

/** Stash order: tab, then row, then column; items without a position last within their tab. */
export function compareStash(a: RareAppraisal, b: RareAppraisal): number {
  const t = (a.tab ?? '').localeCompare(b.tab ?? '', undefined, { numeric: true });
  if (t) return t;
  const pa = a.position;
  const pb = b.position;
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return pa.row - pb.row || pa.column - pb.column;
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
