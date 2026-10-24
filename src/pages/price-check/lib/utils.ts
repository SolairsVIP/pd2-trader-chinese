import { Stat } from './interfaces';
import { itemTypes } from '@/common/item-types';
import { ItemCharmMap, ItemQuality } from '@/common/types/Item';
import { getSkillFilter, isSkillStat } from './skill-stats';
export { getDirectSkillFilter, isDirectSkillStat, isTriggeredSkillStat } from './skill-stats';

/**
 * Cleans item type strings by removing color codes and special formatting characters.
 * Handles patterns like "Catalyst Shardÿc\/" -> "Catalyst Shard"
 */
export function cleanItemType(type: string): string {
  // Remove color codes and special characters (ÿc followed by characters, \/, etc.)
  return (
    type
      // eslint-disable-next-line no-control-regex
      .replace(/ÿc[^\x00-\x7F]*/g, '') // Remove ÿc and any non-ASCII characters that follow
      // eslint-disable-next-line no-useless-escape
      .replace(/[\/\\]+/g, '') // Remove forward/back slashes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  );
}

// parseTypeValue: If true, will parse typeValue as JSON if it contains $in. This is needed for query objects (e.g., buildGetMarketListingQuery),
// but should be left false for URL string building (e.g., buildTradeUrl), which expects a string.
export function getTypeFromBaseType(
  baseType: string,
  parseTypeValue: boolean = false,
): { type: string | object; base: string | object; label: string } | undefined {
  // Clean the type string to remove color codes and special characters
  const cleanedType = cleanItemType(baseType);
  const baseName = cleanedType.toLowerCase();

  const matchedType = itemTypes.find((type) => type.bases.some((b) => b.label.toLowerCase() === baseName));

  if (!matchedType) return;

  const base = matchedType.bases.find((b) => b.label.toLowerCase() === baseName);
  let typeValue: string | object = matchedType.typeValue;
  if (
    parseTypeValue &&
    typeof typeValue === 'string' &&
    typeValue.trim().startsWith('{') &&
    typeValue.includes('$in')
  ) {
    try {
      typeValue = JSON.parse(typeValue);
    } catch (e) {
      // fallback to string if parsing fails
    }
  }
  let baseValue: string | object = base.value;
  if (
    parseTypeValue &&
    typeof baseValue === 'string' &&
    baseValue.trim().startsWith('{') &&
    baseValue.includes('$in')
  ) {
    try {
      baseValue = JSON.parse(baseValue);
    } catch (e) {
      // fallback to string if parsing fails
    }
  }

  return { type: typeValue, base: baseValue, label: base.label };
}

export function getStatKey(stat: Stat): string {
  const filter = getSkillFilter(stat);
  if (filter) {
    return `skill:${filter.property}{${filter.params.join(',')}}${stat.corrupted ? ':corrupted' : ''}`;
  }
  if (!isSkillStat(stat) && stat.stat_id !== undefined) return `id:${stat.stat_id}`;

  // Trigger rows may share a skill name but represent different modifiers and rolls.
  return [
    `id:${stat.stat_id}`,
    stat.skill ? `skill:${stat.skill.trim().toLowerCase()}` : '',
    stat.level === undefined ? '' : `level:${stat.level}`,
    stat.chance === undefined ? '' : `chance:${stat.chance}`,
    stat.value === undefined ? '' : `value:${stat.value}`,
    stat.range ? `range:${stat.range.min ?? ''}-${stat.range.max ?? ''}` : '',
    `name:${typeof stat.name === 'string' ? stat.name.trim().toLowerCase() : ''}`,
  ]
    .filter(Boolean)
    .join(':');
}
