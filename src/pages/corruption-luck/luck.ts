export type LuckTier = 'poor' | 'unlucky' | 'balanced' | 'hopeful' | 'steady' | 'chosen' | 'saint';

export interface LuckResult {
  tier: LuckTier;
  level: number;
  min: number;
  max: number;
  label: string;
  message: string;
}

/** Stable tier ids identify the seven sound slots selected by the user. */
export const LUCK_TIERS: readonly LuckResult[] = [
  { tier: 'poor', level: 1, min: 0, max: 20, label: '非酋附体', message: '先洗洗手，石头都摇头' },
  { tier: 'unlucky', level: 2, min: 21, max: 40, label: '手气欠费', message: '今天先别冲，去扶个凯恩' },
  { tier: 'balanced', level: 3, min: 41, max: 60, label: '五五开', message: '成不成，全看石头心情' },
  { tier: 'hopeful', level: 4, min: 61, max: 80, label: '欧气渐起', message: '感觉能成，先别急着开香槟' },
  { tier: 'steady', level: 5, min: 81, max: 90, label: '欧皇预备', message: '这把稳了，群友准备酸吧' },
  { tier: 'chosen', level: 6, min: 91, max: 95, label: '天选之手', message: '凯恩看了都想拜你为师' },
  { tier: 'saint', level: 7, min: 96, max: 100, label: '瓦圣降临', message: '瓦圣！赶快开瓦！快！' },
];

export function luckResult(score: number): LuckResult {
  return LUCK_TIERS.find((result) => score <= result.max) ?? LUCK_TIERS[LUCK_TIERS.length - 1];
}

/** 101 equally sized buckets, including both 0 and 100. No game or market side effects. */
export function rollLuck(): number {
  return Math.floor(Math.random() * 101);
}
