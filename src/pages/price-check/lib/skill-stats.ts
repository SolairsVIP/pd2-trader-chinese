import { characterSkillMap, skillNameToIdMap } from '@/assets/character-skills';
import { classSkillsMap, classSubSkillMap, classSubSkillMap2, getSkillTabIndex } from '@/assets/class-skills';
import { SITE_STAT_OPTIONS } from '@/pages/market/lib/stat-options.data';
import { PD2_SKILL_TRANSLATION_ALIASES } from '@/lib/pd2-skill-translations';
import gameClientAliases from '@/lib/game-client-aliases.data.json';
import { canonicalizeSkillName } from '@/lib/skill-name-aliases';
import { bilingualGameLabel } from '@/lib/bilingual-game-label';
import type { Stat } from './interfaces';
import { statIdToProperty } from './stat-mappings';

const DIRECT_IDS = new Set([83, 97, 107, 188]);
const TRIGGER_IDS = new Set([195, 196, 197, 198, 199, 200, 201, 202, 203, 205]);
const ELEMENT_IDS = new Set([126, 362, 363, 364, 365, 366]);
const SKILL_IDS = new Set([...DIRECT_IDS, ...TRIGGER_IDS, ...ELEMENT_IDS, 151, 191, 204]);
const CLASS_NAMES = 'Amazon|Sorceress|Necromancer|Paladin|Barbarian|Druid|Assassin';
const CLASS_SUFFIX = new RegExp(`\\s*\\((?:${CLASS_NAMES})(?: Only)?\\)$`, 'i');

export function cleanSkillName(name: string): string {
  return canonicalizeSkillName(name)
    .replace(/ÿc[0-9a-z]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b(amazon|sorceress|necromancer|paladin|barbarian|druid|assassin) only\)/g, '$1)');
}

type AliasIndex = Map<string, Set<number>>;
function addAlias(index: AliasIndex, name: string, id: number) {
  const key = cleanSkillName(name);
  const ids = index.get(key) ?? new Set<number>();
  ids.add(id);
  index.set(key, ids);
}
function uniqueId(index: AliasIndex, name: string): number | undefined {
  const ids = index.get(cleanSkillName(name));
  return ids?.size === 1 ? ids.values().next().value : undefined;
}

// Site labels supply verified display aliases such as Wake of Fire / Wake of
// Inferno. Never use fuzzy matching to turn an unknown skill into another skill.
const characterAliases: AliasIndex = new Map();
for (const [key, label] of SITE_STAT_OPTIONS) {
  const match = /^item_(?:single|nonclass)skill\{(\d+)\}$/.exec(key);
  if (!match) continue;
  const name = label.replace(/^\+\{X\} to /, '').replace(/\s*\(Oskill\)$/i, '');
  addAlias(characterAliases, name, Number(match[1]));
  addAlias(characterAliases, name.replace(CLASS_SUFFIX, ''), Number(match[1]));
}

function englishSkillId(name: string): number | undefined {
  const full = cleanSkillName(name);
  const key = full.replace(/\s*\(oskill\)$/i, '').replace(CLASS_SUFFIX, '');
  return uniqueId(characterAliases, full) ?? skillNameToIdMap[key]?.id ?? uniqueId(characterAliases, key);
}

const clientSkills: AliasIndex = new Map();
for (const [chinese, , rawId] of gameClientAliases.skills) {
  const id = Number(rawId);
  addAlias(clientSkills, String(chinese), id);
  const characterClass = characterSkillMap[id]?.class;
  if (characterClass) {
    addAlias(clientSkills, `${chinese} (${characterClass})`, id);
    addAlias(clientSkills, `${chinese} (${characterClass} Only)`, id);
  }
}
const translatedSkills: AliasIndex = new Map();
for (const [english, chinese] of PD2_SKILL_TRANSLATION_ALIASES) {
  const id = englishSkillId(english);
  if (id !== undefined) addAlias(translatedSkills, chinese, id);
}

const englishSkillAliases: AliasIndex = new Map(characterAliases);
for (const [name, skill] of Object.entries(skillNameToIdMap)) addAlias(englishSkillAliases, name, skill.id);

export function resolveCharacterSkillId(name: string): number | undefined {
  const english = englishSkillId(name);
  if (english !== undefined) return english;
  // A verified client label can differ from our display dictionary (Battle Cry
  // vs War Cry). Do not mix those dictionaries into one ambiguous identity.
  const chinese = clientSkills.has(cleanSkillName(name)) ? uniqueId(clientSkills, name) : uniqueId(translatedSkills, name);
  if (chinese !== undefined) return chinese;
  const bilingual = bilingualGameLabel(name.replace(/\s*\(oskill\)$/i, ''), englishSkillAliases);
  if (!bilingual) return;
  const prefixKey = cleanSkillName(bilingual.prefix);
  const knownPrefix = clientSkills.get(prefixKey) ?? translatedSkills.get(prefixKey);
  // Conflicting known translations must not silently become a different skill.
  if (knownPrefix && !knownPrefix.has(bilingual.value)) return;
  return bilingual.value;
}

const classes: AliasIndex = new Map();
const classChinese = ['亚马逊', '女巫', '死灵法师', '圣骑士', '野蛮人', '德鲁伊', '刺客'];
for (const entry of Object.values(classSkillsMap)) {
  addAlias(classes, entry.name, entry.id);
  addAlias(classes, entry.name.replace(/ Skills$/, ''), entry.id);
  addAlias(classes, entry.name.replace(/Skills$/, 'Skill Levels'), entry.id);
  addAlias(classes, `${classChinese[entry.id]}技能`, entry.id);
  addAlias(classes, `${classChinese[entry.id]}技能等级`, entry.id);
}
addAlias(classes, '法师技能', 1);
addAlias(classes, '法师技能等级', 1);

const tabs: AliasIndex = new Map();
for (const entry of [...Object.values(classSubSkillMap), ...Object.values(classSubSkillMap2)]) {
  const id = getSkillTabIndex(entry.id);
  const stem = entry.name.replace(/ Skills(?= \()/, '');
  const stems = new Set([stem, stem.replace(/Shape Shifting/i, 'Shapeshifting'), stem.replace(/Shape Shifting/i, 'Shape-Shifting')]);
  if (entry.id === 13) stems.add(stem.replace('Masteries', 'Combat Masteries'));
  for (const name of stems) {
    for (const suffix of ['', ' Skills', ' Spells']) {
      addAlias(tabs, name.replace(/ (?=\()/, `${suffix} `), id);
    }
  }
}

export interface SkillFilter {
  kind: 'direct' | 'trigger' | 'aura' | 'charges' | 'elemental';
  property: string;
  params: number[];
  valueIndex: number;
  value?: number;
}

type SkillInput = Pick<Stat, 'stat_id' | 'skill'> & Partial<Pick<Stat, 'name' | 'value' | 'level' | 'chance' | 'charges'>>;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const levelNumber = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value > 0;

const TRIGGER_NAMES: Record<string, number> = {
  'on attack': 195,
  'when you kill an enemy': 196,
  'when you die': 197,
  'on striking': 198,
  'when you level-up': 199,
  'on casting': 200,
  'when struck': 201,
  'on block': 202,
  'on critical hit': 203,
  'on pierce': 205,
};

function chargeCounts(text: string): { remaining: number; capacity: number } | undefined {
  const match = /^\(\s*(\d+)\s*\/\s*(\d+)\s+(?:Charges|聚气|聚氣)\s*\)$/i.exec(text.trim());
  if (!match) return;
  const remaining = Number(match[1]),
    capacity = Number(match[2]);
  if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(capacity) || capacity <= 0 || remaining > capacity)
    return;
  return { remaining, capacity };
}

/** Recover only explicit numeric labels, never guess a skill from approximate text. */
function withSkillLabelData(stat: Stat): Stat {
  // The game can omit name/stat_id on a charged skill and supply a standalone
  // charges string instead. Normalize this before any label parsing or display.
  if (typeof stat.name !== 'string') stat = { ...stat, name: '' };
  if (stat.charges !== undefined && (stat.stat_id === undefined || stat.stat_id === 204)) {
    const counts = typeof stat.charges === 'string' ? chargeCounts(stat.charges) : undefined;
    const hasSkill = typeof stat.skill === 'string' && stat.skill.trim().length > 0;
    const name =
      counts && hasSkill && levelNumber(stat.level)
        ? `Level ${stat.level} ${stat.skill} (${counts.remaining}/${counts.capacity} Charges)`
        : stat.name || '聚气技能（数据不完整）';
    stat = { ...stat, name, stat_id: stat.stat_id ?? 204 };
  }
  const label = stat.name.replace(/ÿc[0-9a-z]/gi, '').trim();
  let inferred: Partial<Stat> | undefined;
  const trigger =
    /^(\d+(?:\.\d+)?|%d)%{1,2}\s+Chance to cast level\s+(\d+|%d)\s+(.+?)\s+(on attack|when you kill an enemy|when you die|on striking|when you level-up|on casting|when struck|on block|on critical hit|on pierce)$/i.exec(
      label,
    );
  if (trigger) {
    inferred = {
      stat_id: TRIGGER_NAMES[trigger[4].toLowerCase()],
      chance: trigger[1] === '%d' ? undefined : Number(trigger[1]),
      level: trigger[2] === '%d' ? undefined : Number(trigger[2]),
      skill: trigger[3] === '%s' ? undefined : trigger[3],
    };
  } else {
    const aura = /^Level\s+(\d+)\s+(.+?)\s+(Aura When Equipped|When Equipped)$/i.exec(label);
    const charges = /^Level\s+(\d+)\s+(.+?)\s+\(\d+\s*\/\s*\d+\s+Charges\)$/i.exec(label);
    if (aura) inferred = { stat_id: /^aura/i.test(aura[3]) ? 151 : 191, level: Number(aura[1]), skill: aura[2] };
    else if (charges) inferred = { stat_id: 204, level: Number(charges[1]), skill: charges[2] };
    else {
      const direct = /^\+?(\d+)\s+to\s+(.+)$/i.exec(label);
      if (
        direct &&
        (resolveCharacterSkillId(direct[2]) !== undefined ||
          uniqueId(classes, direct[2]) !== undefined ||
          uniqueId(tabs, direct[2]) !== undefined)
      ) {
        inferred = { skill: direct[2], value: Number(direct[1]) };
      }
    }
  }
  if (!inferred || (stat.stat_id !== undefined && inferred.stat_id !== undefined && stat.stat_id !== inferred.stat_id))
    return stat;
  return {
    ...stat,
    stat_id: stat.stat_id ?? inferred.stat_id,
    skill: stat.skill ?? inferred.skill,
    level: stat.level ?? inferred.level,
    chance: stat.chance ?? inferred.chance,
    value: stat.value ?? inferred.value,
  };
}

function bonusName(stat: SkillInput): string | undefined {
  if (stat.skill?.trim()) return stat.skill.trim();
  const match = /^(?:\+?(?:\d+|%d)\s+)?to\s+(.+)$/i.exec(stat.name?.trim() ?? '');
  return match?.[1];
}

export function isDirectSkillStat(stat: SkillInput): boolean {
  if (stat.stat_id !== undefined && DIRECT_IDS.has(stat.stat_id)) return true;
  if (stat.stat_id != null || stat.level !== undefined || stat.chance !== undefined || stat.charges !== undefined || !finite(stat.value))
    return false;
  const name = stat.name?.trim() ?? '';
  const bonus = bonusName(stat);
  if (!bonus) return false;
  const plainBonus =
    /^(?:\+?(?:\d+|%d)\s+)?to\s+/i.test(name) ||
    (stat.skill && cleanSkillName(name) === cleanSkillName(stat.skill));
  if (!plainBonus) return false;
  return Boolean(
    stat.skill ||
    resolveCharacterSkillId(bonus) !== undefined ||
    uniqueId(classes, bonus) !== undefined ||
    uniqueId(tabs, bonus) !== undefined,
  );
}

export function isTriggeredSkillStat(stat: Pick<Stat, 'stat_id'>): boolean {
  return stat.stat_id !== undefined && TRIGGER_IDS.has(stat.stat_id);
}

export function isSkillStat(stat: Stat): boolean {
  const data = withSkillLabelData(stat);
  return (data.stat_id !== undefined && SKILL_IDS.has(data.stat_id)) || Boolean(data.skill) || isDirectSkillStat(data);
}

/** One complete filter contract for row selection, defaults, URL and API queries. */
export function getSkillFilter(stat: Stat): SkillFilter | undefined {
  stat = withSkillLabelData(stat);
  if (stat.stat_id !== undefined && ELEMENT_IDS.has(stat.stat_id)) {
    let property = statIdToProperty[stat.stat_id];
    if (stat.stat_id === 126) {
      const element = /(?:^|\s)(cold|fire|lightning|poison|magic) skills\b/i
        .exec(stat.skill ?? stat.name)?.[1]
        ?.toLowerCase();
      if (!element) return;
      property = `item_elemskill_${element}`;
    }
    return { kind: 'elemental', property, params: [], valueIndex: 1, value: stat.value };
  }
  if (isDirectSkillStat(stat)) {
    const name = bonusName(stat);
    if (!name) return;
    const classId = uniqueId(classes, name) ?? uniqueId(classes, name.replace(CLASS_SUFFIX, ''));
    const tabId = uniqueId(tabs, name);
    const oskill = stat.stat_id === 97 || /\(oskill\)/i.test(`${stat.name} ${name}`);
    if (stat.stat_id === 83) {
      return classId === undefined
        ? undefined
        : { kind: 'direct', property: 'item_addclassskills', params: [classId], valueIndex: 1, value: stat.value };
    }
    if (stat.stat_id === 188) {
      return tabId === undefined
        ? undefined
        : { kind: 'direct', property: 'item_addskill_tab', params: [tabId], valueIndex: 1, value: stat.value };
    }
    const labelName = stat.name.replace(/^(?:\+?(?:\d+|%d)\s+)?to\s+/i, '');
    const unqualified = (value: string) => cleanSkillName(value).replace(/\s*\(oskill\)$/i, '').replace(CLASS_SUFFIX, '');
    // A matching class qualifier can disambiguate a skill/proc alias. A label
    // naming a different skill must never override the explicit skill field.
    const id =
      (unqualified(labelName) === unqualified(name) ? resolveCharacterSkillId(labelName) : undefined) ??
      resolveCharacterSkillId(name);
    // Short tree labels such as Lightning also name an individual skill. With
    // neither a modifier kind nor a distinct Skills label, do not invent one.
    if (stat.stat_id === undefined && tabId !== undefined && id !== undefined) return;
    if (id !== undefined) {
      return {
        kind: 'direct',
        property: oskill ? 'item_nonclassskill' : 'item_singleskill',
        params: [id],
        valueIndex: 1,
        value: stat.value,
      };
    }
    // Older clipboard formats use 107 for all three kinds of direct bonuses.
    if (!oskill && classId !== undefined)
      return { kind: 'direct', property: 'item_addclassskills', params: [classId], valueIndex: 1, value: stat.value };
    if (!oskill && tabId !== undefined)
      return { kind: 'direct', property: 'item_addskill_tab', params: [tabId], valueIndex: 1, value: stat.value };
    return;
  }
  if (!stat.skill) return;
  const id = resolveCharacterSkillId(stat.skill);
  if (id === undefined) return;
  const labelLevel = /\bLevel\s+(\d+)\b/i.exec(stat.name)?.[1];
  const level = stat.level ?? (labelLevel === undefined ? undefined : Number(labelLevel));
  if (isTriggeredSkillStat(stat)) {
    if (!levelNumber(level)) return;
    const chance = stat.chance ?? stat.value;
    if (chance !== undefined && (!finite(chance) || chance < 0)) return;
    return {
      kind: 'trigger',
      property: statIdToProperty[stat.stat_id!],
      params: [level, id],
      valueIndex: 2,
      value: chance,
    };
  }
  if (stat.stat_id === 151 || stat.stat_id === 191) {
    const auraLevel = level ?? stat.value;
    if (!levelNumber(auraLevel)) return;
    return { kind: 'aura', property: statIdToProperty[stat.stat_id], params: [id], valueIndex: 1, value: auraLevel };
  }
  if (stat.stat_id === 204) {
    // Verified against a public PD2 listing: [level, skill, remaining, capacity].
    // Pin the skill and its level; the optional range applies to remaining uses.
    if (!levelNumber(level)) return;
    const labelCharges = /\(\d+\s*\/\s*\d+\s+Charges\)/i.exec(stat.name)?.[0];
    const charges =
      stat.charges !== undefined
        ? typeof stat.charges === 'string'
          ? chargeCounts(stat.charges)
          : undefined
        : labelCharges
          ? chargeCounts(labelCharges)
          : undefined;
    // An explicitly supplied but invalid charge count must not become a valid
    // filter by silently falling back to the label or the generic value field.
    if ((stat.charges !== undefined || labelCharges !== undefined) && !charges) return;
    return {
      kind: 'charges',
      property: 'item_charged_skill',
      params: [level, id],
      valueIndex: 2,
      value: charges?.remaining,
    };
  }
}

/** Kept for callers that only need the direct-bonus modifier and parameter. */
export function getDirectSkillFilter(stat: Stat): { property: string; id: number } | undefined {
  const filter = getSkillFilter(stat);
  if (filter?.kind === 'direct') return { property: filter.property, id: filter.params[0] };
}

export function skillFilterUnavailableReason(stat: Stat): string | undefined {
  if (!isSkillStat(stat) || getSkillFilter(stat)) return;
  if (stat.stat_id === 204) return '聚气技能缺少可确认的技能或等级，暂不能精确筛选；可使用其他属性查价。';
  if (isTriggeredSkillStat(stat)) return '无法确认触发技能名称或等级，暂不能精确筛选；可使用其他属性查价。';
  return '无法唯一确定技能或技能树，暂不能精确筛选；可使用其他属性查价。';
}

/** Preserve inferred oskill kind before the display layer shortens the label. */
export function normalizeSkillStat(stat: Stat): Stat {
  const data = withSkillLabelData(stat);
  const filter = getSkillFilter(data);
  if (!filter) return data;
  const directIds: Record<string, number> = {
    item_singleskill: 107,
    item_nonclassskill: 97,
    item_addclassskills: 83,
    item_addskill_tab: 188,
  };
  const originalName = bonusName(data);
  // A class-qualified alias may resolve while its shortened name is ambiguous
  // (e.g. Amplify Damage vs its proc). Keep the canonical identity in that case.
  const directName =
    filter.kind === 'direct' &&
    (filter.property === 'item_singleskill' || filter.property === 'item_nonclassskill') &&
    originalName &&
    resolveCharacterSkillId(originalName) !== filter.params[0]
      ? (characterSkillMap[filter.params[0]]?.name ?? originalName)
      : originalName;
  // Some game copies label every class bonus as Amazon while skill explicitly
  // identifies another class. Keep display and query tied to that same identity.
  const canonicalDirectName = directName && canonicalizeSkillName(directName);
  return {
    ...data,
    ...(filter.kind === 'direct'
      ? { stat_id: directIds[filter.property], skill: canonicalDirectName, name: canonicalDirectName ?? data.name }
      : {}),
    ...(filter.value === undefined ? {} : { value: filter.value }),
    ...(filter.kind === 'charges' ? { value: filter.value } : {}),
    // A range belonging to remaining charges or another source value must not
    // clamp a level/chance filter to unrelated bounds.
    ...(filter.value !== undefined && filter.value !== stat.value ? { range: undefined } : {}),
    ...(filter.kind === 'trigger' ? { level: filter.params[0] } : {}),
  };
}
