import supplied from './pd2-skill-translations.data.json';
import { PD2_SKILL_TRANSLATIONS } from './pd2-skill-translations';

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const skills = new Map(Object.entries(PD2_SKILL_TRANSLATIONS).map(([en, zh]) => [normalize(en), zh]));
const classes: Record<string, string> = {
  amazon: '亚马逊',
  sorceress: '法师',
  necromancer: '死灵法师',
  paladin: '圣骑士',
  barbarian: '野蛮人',
  druid: '德鲁伊',
  assassin: '刺客',
};
const classEnglish = Object.keys(classes);
const classSuffix = new RegExp(`\\s*\\((${classEnglish.join('|')})( only)?\\)$`, 'i');
const classBonusPattern = new RegExp(`^(${classEnglish.join('|')}) (?:skills|skill levels)$`);
const classPrefix = new RegExp(`^(${classEnglish.join('|')}) (.+)$`);
const trees = new Map<string, string>();
const bareTrees = new Map<string, Set<string>>();
for (const tree of supplied.trees) {
  const characterClass = classEnglish.find((name) => classes[name] === tree.class)!;
  const stem = tree.english.replace(/ (?:Skills|Spells)$/, '');
  const stems = new Set([stem]);
  if (stem === 'Combat Masteries') stems.add('Masteries');
  if (stem === 'Shape Shifting') {
    stems.add('Shapeshifting');
    stems.add('Shape-Shifting');
  }
  for (const name of stems) {
    for (const suffix of ['', ' Skills', ' Spells']) {
      const english = normalize(name + suffix);
      trees.set(`${characterClass}:${english}`, tree.chinese);
      const candidates = bareTrees.get(english) ?? new Set<string>();
      candidates.add(tree.chinese);
      bareTrees.set(english, candidates);
    }
  }
}

/** Exact display matches only. Never replace short skill names inside other text. */
export function localizeSkillName(name: string): string {
  let key = normalize(name);
  let classContext: string | undefined;
  let qualifier = '';
  const restricted = classSuffix.exec(key);
  const oskill = /\s*\(oskill\)$/i.exec(key);
  if (restricted) {
    classContext = restricted[1];
    qualifier = `（${classes[classContext]}${restricted[2] ? '专属' : ''}）`;
    key = key.slice(0, restricted.index).trim();
  } else if (oskill) {
    qualifier = '（非本职业技能）';
    key = key.slice(0, oskill.index).trim();
  }

  if (/^all (?:skills|skill levels)$/.test(key)) return `所有技能${qualifier}`;
  const classBonus = classBonusPattern.exec(key);
  if (classBonus) return `${classes[classBonus[1]]}技能等级${qualifier}`;

  // Site filters prefix the class; item tooltips normally use a class suffix.
  const prefixed = classPrefix.exec(key);
  if (prefixed && !classContext) {
    const tree = trees.get(`${prefixed[1]}:${prefixed[2]}`);
    if (tree) return `${tree}（${classes[prefixed[1]]}）`;
  }
  const contextualTree = classContext && trees.get(`${classContext}:${key}`);
  if (contextualTree) return `${contextualTree}${qualifier}`;

  const skill = skills.get(key);
  if (skill) return `${skill}${qualifier}`;

  // Without class context, Fire Skills means all fire skills, not a Sorceress tab.
  const elemental = /^(cold|fire|lightning|poison|magic) skills$/.exec(key);
  if (elemental) {
    const elements: Record<string, string> = {
      cold: '冰冷',
      fire: '火焰',
      lightning: '闪电',
      poison: '毒素',
      magic: '魔法',
    };
    return `${elements[elemental[1]]}技能等级${qualifier}`;
  }
  // Short names such as Fire are interpreted as trees only with class context
  // or a Skills/Spells suffix, so ordinary text keeps its original meaning.
  if (/ (?:skills|spells)$/.test(key)) {
    const candidates = bareTrees.get(key);
    if (candidates?.size === 1) return `${candidates.values().next().value}${qualifier}`;
  }
  return name;
}
