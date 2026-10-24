import client from './game-client-aliases.data.json';
import { PD2_ITEM_TRANSLATIONS } from './pd2-item-translations';
import { uniqueItems, setItems } from '@/assets/items';
import { characterSkillMap } from '@/assets/character-skills';
import { classSkillsMap, classSubSkillMap } from '@/assets/class-skills';
import skillReference from './pd2-skill-translations.data.json';
import { normalizeSkillStat, resolveCharacterSkillId } from '@/pages/price-check/lib/skill-stats';
import type { Stat } from '@/pages/price-check/lib/interfaces';

type Aliases = Map<string, Set<string>>;
const clean = (s: string) => s.replace(/ÿc./g, '').replace(/\s+/g, ' ').trim();
const key = (s: string) => clean(s).replace(/[’‘]/g, "'").toLowerCase();
const hasChinese = (s: string) => /[\u3400-\u9fff]/u.test(s);
function add(index: Aliases, chinese: string, english: string) {
  const candidates = index.get(key(chinese)) ?? new Set<string>();
  candidates.add(english);
  index.set(key(chinese), candidates);
}
function unique(index: Aliases, name: string): string | undefined {
  const candidates = index.get(key(name));
  return candidates?.size === 1 ? candidates.values().next().value : undefined;
}
const bases: Aliases = new Map(),
  baseFallback: Aliases = new Map();
const names: Record<string, Aliases> = { Unique: new Map(), Set: new Map(), Runeword: new Map() };
const nameFallback: Record<string, Aliases> = { Unique: new Map(), Set: new Map(), Runeword: new Map() };
for (const [zh, en] of client.bases) add(bases, zh, en);
for (const [kind, zh, en] of client.items) add(names[kind], zh, en);
for (const [en, zh] of Object.entries(PD2_ITEM_TRANSLATIONS.Base)) add(baseFallback, zh, en);
for (const kind of ['Unique', 'Set', 'Runeword'] as const) {
  const items = kind === 'Unique' ? uniqueItems : kind === 'Set' ? setItems : [];
  const canonical = new Map<string, string>();
  for (const item of items) {
    canonical.set(key(item.name), item.key);
    canonical.set(key(item.key), item.key);
  }
  for (const [en, zh] of Object.entries(PD2_ITEM_TRANSLATIONS[kind]))
    add(nameFallback[kind], zh, canonical.get(key(en)) ?? en);
}
// Client aliases take precedence over display translations, whose wording may
// differ. An ambiguous client label must not fall through to a convenient guess.
function resolve(primary: Aliases, fallback: Aliases, name: string) {
  return primary.has(key(name)) ? unique(primary, name) : unique(fallback, name);
}

const classes: Aliases = new Map(),
  tabs: Aliases = new Map();
const classLabels = ['亚马逊', '法师', '死灵法师', '圣骑士', '野蛮人', '德鲁伊', '刺客'];
const chineseClasses = new Map<string, string>();
for (const entry of Object.values(classSkillsMap)) {
  const label = classLabels[entry.id],
    english = entry.name.replace(/ Skills$/, '');
  chineseClasses.set(label, english);
  if (entry.id === 1) chineseClasses.set('女巫', english);
  for (const zh of entry.id === 1 ? [label, '女巫'] : [label])
    for (const suffix of ['技能', '技能等级']) add(classes, zh + suffix, entry.name);
}
for (let i = 0; i < skillReference.trees.length; i++) {
  const tree = skillReference.trees[i],
    english = classSubSkillMap[i].name;
  add(tabs, tree.chinese, english);
  add(tabs, `${tree.chinese}（${tree.class}）`, english);
  add(tabs, `${tree.chinese}（仅限${tree.class}）`, english);
}
const elements: Record<string, string> = {
  火焰: 'Fire',
  冰冷: 'Cold',
  闪电: 'Lightning',
  毒素: 'Poison',
  魔法: 'Magic',
};

// Decode only complete templates found in the client's TBL under verified
// modifier keys. Chinese sentence fragments are never fuzzy-matched to a proc.
const labelTemplates = client.stats.flatMap(([zh, en, id]) => {
  if (!String(zh).includes('%s')) return [];
  const tokens: string[] = [];
  const escaped = String(zh)
    .split(/(%d|%s|%%)/)
    .map((part) => {
      if (part === '%%') return '%';
      if (part === '%d' || part === '%s') {
        tokens.push(part);
        return part === '%d' ? '(-?\\d+(?:\\.\\d+)?)' : '(.+?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    })
    .join('');
  return [{ pattern: new RegExp(`^${escaped}$`), english: String(en), id: Number(id), tokens }];
});

function translateSkillLabel(stat: Record<string, any>): Record<string, any> {
  if (typeof stat.name !== 'string') return stat;
  const matches = labelTemplates.flatMap((template) => {
    if (stat.stat_id != null && stat.stat_id !== template.id) return [];
    const match = template.pattern.exec(clean(stat.name));
    return match ? [{ template, captures: match.slice(1) }] : [];
  });
  if (new Set(matches.map(({ template }) => template.id)).size !== 1) return stat;
  const { template, captures } = matches[0];
  const values = captures.map((value, i) =>
    template.tokens[i] === '%s' ? stat.skill || normalizeSkill(value) || value : value,
  );
  let index = 0;
  const name = template.english.replace(/%d|%s|%%/g, (token) => (token === '%%' ? '%' : values[index++]));
  return { ...stat, name, stat_id: stat.stat_id ?? template.id };
}

function normalizeSkill(name: string, statId?: number): string | undefined {
  if (statId === 83) return unique(classes, name);
  if (statId === 188) return unique(tabs, name);
  if (statId === 126) {
    const element = /^(火焰|冰冷|闪电|毒素|魔法)技能(?:等级)?$/.exec(clean(name));
    return element && `${elements[element[1]]} Skills`;
  }
  const id = resolveCharacterSkillId(name);
  if (id !== undefined) return characterSkillMap[id]?.name;
  // Older game exports use 107 for class and tab bonuses as well.
  if (statId === undefined || statId === 107) {
    const candidates = new Set([unique(classes, name), unique(tabs, name)].filter(Boolean));
    if (candidates.size === 1) return candidates.values().next().value;
  }
  return undefined;
}

function normalizeStat(stat: Record<string, any>): Record<string, any> {
  if (!stat || typeof stat !== 'object') return stat;
  const result = { ...stat };
  if (typeof stat.name === 'string' && hasChinese(stat.name)) {
    const matching = client.stats.filter(
      ([zh, , id]) =>
        key(String(zh)) === key(stat.name) &&
        (stat.stat_id === id || (stat.stat_id == null && id === 0 && !stat.skill)),
    );
    const labels = new Set(matching.map(([, en]) => en));
    if (labels.size === 1) {
      result.name = labels.values().next().value;
      // The game omits stat_id zero. Never override an explicit modifier id.
      if (stat.stat_id == null) result.stat_id = 0;
    }
  }
  if (typeof stat.skill === 'string' && hasChinese(stat.skill)) {
    let skill = normalizeSkill(stat.skill, stat.stat_id);
    const suffix = /^(.*?)\s*[（(](?:仅限)?(亚马逊|女巫|法师|死灵法师|圣骑士|野蛮人|德鲁伊|刺客)(?:专属)?[）)]$/.exec(
      stat.skill,
    );
    if (!skill && suffix) {
      const englishClass = chineseClasses.get(suffix[2]);
      const contextualId = resolveCharacterSkillId(`${suffix[1]} (${englishClass})`);
      const short = normalizeSkill(suffix[1], stat.stat_id);
      if (stat.stat_id !== 83 && stat.stat_id !== 188 && contextualId !== undefined)
        skill = characterSkillMap[contextualId]?.name;
      else if (short) {
        const resolvedId = resolveCharacterSkillId(short);
        if (resolvedId !== undefined && characterSkillMap[resolvedId]?.class === englishClass) skill = short;
        else if (stat.stat_id === 188) skill = unique(tabs, `${suffix[1]}（${suffix[2]}）`);
      } else if (stat.stat_id === 188) skill = unique(tabs, `${suffix[1]}（${suffix[2]}）`);
    }
    if (skill) result.skill = skill;
    // Unknown/ambiguous skills stay intact. The existing filter resolver shows
    // them as unavailable instead of inventing a different skill or its level.
  }
  let translated = translateSkillLabel(result);
  // These clients can export an Amazon *label* for a Necromancer bonus, or a
  // Javelin label for a Bow tab. The explicit skill field is the identity.
  if (
    typeof translated.skill === 'string' &&
    typeof translated.value === 'number' &&
    translated.level == null &&
    translated.chance == null &&
    (translated.stat_id == null || [83, 97, 107, 188].includes(translated.stat_id))
  ) {
    const oskill = /oskill|非本职业/i.test(stat.name ?? '');
    translated = { ...translated, name: `+${translated.value} to ${translated.skill}${oskill ? ' (Oskill)' : ''}` };
  }
  return normalizeSkillStat(translated as Stat);
}

export interface GameItemInput {
  text: string | null;
  error?: string;
}

/** The sole input boundary for game copies; never applied to website responses. */
export function normalizeGameItemInput(raw: string | null): GameItemInput {
  if (!raw || !hasChinese(raw)) return { text: raw };
  let item: Record<string, any>;
  try {
    item = JSON.parse(raw);
  } catch {
    return { text: raw };
  }
  if (
    !item ||
    typeof item !== 'object' ||
    typeof item.type !== 'string' ||
    typeof item.quality !== 'string' ||
    typeof item.iLevel !== 'number'
  )
    return { text: raw };
  try {
    const normalizeItem = (source: Record<string, any>): Record<string, any> => {
      const result = { ...source };
      if (typeof source.type === 'string' && hasChinese(source.type)) {
        const english = resolve(bases, baseFallback, source.type);
        if (!english) throw new Error(`无法唯一识别中文底材“${clean(source.type)}”，请提供这件装备的复制数据。`);
        result.type = english;
      }
      const kind = source.isRuneword || source.quality === 'Runeword' ? 'Runeword' : source.quality;
      const field = kind === 'Runeword' && source.runeword ? 'runeword' : 'name';
      if (names[kind] && typeof source[field] === 'string' && hasChinese(source[field])) {
        const english = resolve(names[kind], nameFallback[kind], source[field]);
        if (!english) throw new Error(`无法唯一识别中文物品“${clean(source[field])}”，请提供这件装备的复制数据。`);
        result[field] = english;
      }
      // Random rare/magic names do not determine item identity; retain them.
      if (Array.isArray(source.stats)) result.stats = source.stats.map(normalizeStat);
      // Socket contents are ancillary; an unknown rune/gem must not prevent a
      // valid parent item from being queried. Keep such child records intact.
      if (Array.isArray(source.socketed))
        result.socketed = source.socketed.map((child) => {
          try {
            return normalizeItem(child);
          } catch {
            return child;
          }
        });
      return result;
    };
    return { text: JSON.stringify(normalizeItem(item)) };
  } catch (error) {
    return { text: null, error: error instanceof Error ? error.message : '中文物品数据无法转换。' };
  }
}
