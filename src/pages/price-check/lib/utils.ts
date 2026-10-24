import { Stat } from './interfaces';
import { itemTypes } from '@/common/item-types';
import { ItemCharmMap, ItemQuality } from '@/common/types/Item';
import { skillNameToIdMap } from '@/assets/character-skills';
import { classSkillNameToIdMap, fuzzyClassSubSkillByName, getSkillTabIndex } from '@/assets/class-skills';

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

const DIRECT_SKILL_STAT_IDS = new Set([83, 97, 107, 188]);

/** Only direct skill bonuses use a skill name as their identity. Proc stats also carry skills. */
export function isDirectSkillStat(
  stat: Pick<Stat, 'stat_id' | 'skill'> & Partial<Pick<Stat, 'name' | 'value' | 'level' | 'chance'>>,
): boolean {
  if (!stat.skill) return false;
  if (DIRECT_SKILL_STAT_IDS.has(stat.stat_id)) return true;
  // Game clipboard data can omit stat_id for a plain skill bonus. Require its
  // specific shape so charges, auras and chance-to-cast modifiers stay distinct.
  if (stat.stat_id != null || stat.level !== undefined || stat.chance !== undefined || typeof stat.value !== 'number') {
    return false;
  }
  const name = stat.name?.trim().replace(/^[+-]?\d+\s+to\s+/i, '').toLowerCase();
  return name === stat.skill.trim().toLowerCase();
}

/** Shared by row availability and both query builders to keep selectable filters usable. */
export function getDirectSkillFilter(stat: Stat): { property: string; id: number } | undefined {
  if (!isDirectSkillStat(stat) || !stat.skill) return;
  const name = stat.skill.trim().toLowerCase();
  const skill = skillNameToIdMap[name];
  if (skill) {
    return { property: stat.stat_id === 97 ? 'item_nonclassskill' : 'item_singleskill', id: skill.id };
  }
  const classSkill = classSkillNameToIdMap[name];
  if (classSkill) return { property: 'item_addclassskills', id: classSkill.id };
  const tab = fuzzyClassSubSkillByName(name);
  if (tab) return { property: 'item_addskill_tab', id: getSkillTabIndex(tab.id) };
}

const TRIGGERED_SKILL_STAT_IDS = new Set([195, 196, 197, 198, 199, 200, 201, 202, 203, 205]);

export function isTriggeredSkillStat(stat: Pick<Stat, 'stat_id'>): boolean {
  return TRIGGERED_SKILL_STAT_IDS.has(stat.stat_id);
}

export function getStatKey(stat: Stat): string {
  const skill = stat.skill?.trim().toLowerCase();
  if (isDirectSkillStat(stat) && skill) return `skill:${skill}`;
  if (!skill && !isTriggeredSkillStat(stat)) return `id:${stat.stat_id}`;

  // Trigger rows may share a skill name but represent different modifiers and rolls.
  return [
    `id:${stat.stat_id}`,
    skill ? `skill:${skill}` : '',
    stat.level === undefined ? '' : `level:${stat.level}`,
    stat.chance === undefined ? '' : `chance:${stat.chance}`,
    stat.value === undefined ? '' : `value:${stat.value}`,
    stat.range ? `range:${stat.range.min ?? ''}-${stat.range.max ?? ''}` : '',
    `name:${stat.name.trim().toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(':');
}
