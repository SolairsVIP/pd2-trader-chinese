import { uniqueItems, setItems, runeWords } from '@/assets/items';
import type { Item, Stat } from './interfaces';
import { getSkillFilter, normalizeSkillStat } from './skill-stats';

const fixedItems = new Map(
  [...uniqueItems, ...setItems, ...runeWords].flatMap((item) =>
    [item.key, item.name].map((name) => [`${item.kind}:${name.toLowerCase()}`, item] as const),
  ),
);

/** Infer only the missing modifier kind from an exact fixed item with oskills only. */
export function normalizeItemSkillStat(
  item: Pick<Item, 'name' | 'runeword' | 'isRuneword' | 'quality' | 'type'>,
  stat: Stat,
): Stat {
  const normalized = normalizeSkillStat(stat);
  if (stat.stat_id != null || stat.corrupted || typeof stat.value !== 'number') return normalized;
  if (/\bOnly\b/i.test(`${stat.name ?? ''} ${stat.skill ?? ''}`)) return normalized;
  if (getSkillFilter(normalized)?.property !== 'item_singleskill') return normalized;
  const kind =
    item.isRuneword || item.quality === 'Runeword'
      ? 'item.runeword'
      : item.quality === 'Unique'
        ? 'item.unique'
        : item.quality === 'Set'
          ? 'item.set'
          : '';
  const name = (item.isRuneword ? item.runeword : item.name)?.toLowerCase();
  const fixed = name && fixedItems.get(`${kind}:${name}`);
  if (!fixed || fixed.base.toLowerCase() !== item.type.toLowerCase()) return normalized;
  const direct = fixed.modifiers.filter((modifier) => modifier.key === 'skill' || modifier.key === 'oskill');
  if (!direct.length || direct.some((modifier) => modifier.key !== 'oskill')) return normalized;
  if (!direct.some((modifier) => stat.value! >= modifier.min && stat.value! <= modifier.max)) return normalized;
  return normalizeSkillStat({ ...normalized, stat_id: 97 });
}
