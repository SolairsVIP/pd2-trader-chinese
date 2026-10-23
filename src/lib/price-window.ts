/**
 * Price windows for price-check averages (the `hours` param of `/item-prices/average`) and the labels for
 * the window a price was actually computed over (`priceWindow`, set by servers that fall back to a longer
 * window when the requested one has too few sales: 7d → 30d → season → last season). Mirrors the website's
 * PriceWindowTag.
 */
import { getCurrentSeason, SEASONS } from './seasons';

export type PriceWindowHours = 24 | 72 | 168 | 720;

export const DEFAULT_PRICE_WINDOW_HOURS: PriceWindowHours = 168;

export const PRICE_WINDOW_OPTIONS: { hours: PriceWindowHours; label: string }[] = [
  { hours: 24, label: '24 小时' },
  { hours: 72, label: '3 天' },
  { hours: 168, label: '7 天' },
  { hours: 720, label: '30 天' },
];

/** Server label for a rolling window of `hours` ('7d' for 168, '24h' for 24), as in `priceWindow`. */
export function windowLabel(hours: number): string {
  return hours > 24 && hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`;
}

/** "7-day avg" / "24-hour avg" / "season avg" for a requested window label. */
export function basisLabel(window: string): string {
  const match = /^(\d+)([dh])$/.exec(window);
  if (!match) return '赛季均价';
  return `${match[1]}${match[2] === 'd' ? '天' : '小时'}均价`;
}

/** Tag of the season before the current one (what the server's 'lastSeason' fallback prices), e.g. 'S12'. */
function lastSeasonTag(now: Date = new Date()): string {
  const current = getCurrentSeason(SEASONS, now);
  const previous = current ? SEASONS[SEASONS.indexOf(current) + 1] : undefined;
  return previous ? (/\((S\d+)\)/.exec(previous.label)?.[1] ?? previous.id.toUpperCase()) : '上赛季';
}

/**
 * `{ label, title }` for a price the server computed over a longer fallback window than the requested one;
 * null when it used the requested window or didn't say (older servers).
 */
export function priceWindowNote(
  priceWindow: string | undefined,
  requestedWindow: string,
  now: Date = new Date(),
): { label: string; title: string } | null {
  if (!priceWindow || priceWindow === requestedWindow) return null;
  const last = lastSeasonTag(now);
  const basis: Record<string, [string, string]> = {
    '30d': ['30 天', '最近 30 天'],
    season: ['赛季', '整个赛季'],
    lastSeason: [last, `${last} 最近 30 天`],
  };
  const [label, text] = basis[priceWindow] ?? [priceWindow, `最近 ${priceWindow}`];
  const period = requestedWindow === '7d' ? '本周' : `最近 ${requestedWindow}`;
  return { label, title: `${period}成交数据不足，采用${text}的数据` };
}
