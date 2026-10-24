import { PD2_AFFIX_TRANSLATIONS } from './pd2-affix-translations';
import { PD2_SKILL_TRANSLATIONS } from './pd2-skill-translations';

/** Simplified Chinese labels for English stat text supplied by PD2 item and market data. */
const PHRASES: Array<[string, string]> = [
  ['to Critical Strike', '致命攻击'],
  ['to Valkyrie', '女武神'],
  ['to Mana after each Kill', '每次击杀后获得法力'],
  ['Mana after each Kill', '每次击杀后获得法力'],
  ['Lightning Bolt', '闪电球'],
  ['Lightning Fury', '闪电之怒'],
  ['Critical Strike', '致命攻击'],
  ['Valkyrie', '女武神'],
  ['Amazon Only', '亚马逊专属'],
  ['Sorceress Only', '女巫专属'],
  ['Necromancer Only', '死灵法师专属'],
  ['Paladin Only', '圣骑士专属'],
  ['Barbarian Only', '野蛮人专属'],
  ['Druid Only', '德鲁伊专属'],
  ['Assassin Only', '刺客专属'],
  ['to Maximum Cold Damage', '最高冰冷伤害'],
  ['to Minimum Cold Damage', '最低冰冷伤害'],
  ['to Maximum Fire Damage', '最高火焰伤害'],
  ['to Minimum Fire Damage', '最低火焰伤害'],
  ['to Maximum Lightning Damage', '最高闪电伤害'],
  ['to Minimum Lightning Damage', '最低闪电伤害'],
  ['to Maximum Poison Damage', '最高毒素伤害'],
  ['to Minimum Poison Damage', '最低毒素伤害'],
  ['to Maximum Damage', '最高伤害'],
  ['to Minimum Damage', '最低伤害'],
  ['to Enemy Lightning Resistance', '降低敌人闪电抗性'],
  ['to Enemy Fire Resistance', '降低敌人火焰抗性'],
  ['to Enemy Cold Resistance', '降低敌人冰冷抗性'],
  ['to Enemy Poison Resistance', '降低敌人毒素抗性'],
  ['to Enemy Physical Resistance', '降低敌人物理抗性'],
  ['Faster Run/Walk', '高速跑步/行走'],
  ['Regenerate Mana', '法力回复'],
  ['Maximum Stamina', '最大耐力'],
  ['Slower Stamina Drain', '耐力消耗降低'],
  ['All Resistances', '全元素抗性'],
  ['All Resist', '全元素抗性'],
  ['Cold Resist', '冰冷抗性'],
  ['Fire Resist', '火焰抗性'],
  ['Lightning Resist', '闪电抗性'],
  ['Poison Resist', '毒素抗性'],
  ['to All Skills', '所有技能'],
  ['to Amazon Skill Levels', '亚马逊技能等级'],
  ['to Cold Skills', '冰冷技能等级'],
  ['to Fire Skills', '火焰技能等级'],
  ['to Lightning Skills', '闪电技能等级'],
  ['to Poison Skills', '毒素技能等级'],
  ['to Magic Skills', '魔法技能等级'],
  ['to Cold Skill Damage', '冰冷技能伤害'],
  ['to Fire Skill Damage', '火焰技能伤害'],
  ['to Lightning Skill Damage', '闪电技能伤害'],
  ['to Poison Skill Damage', '毒素技能伤害'],
  ['To Magic Skill Damage', '魔法技能伤害'],
  ['to Strength', '力量'],
  ['to Dexterity', '敏捷'],
  ['to Vitality', '体力'],
  ['to Energy', '精力'],
  ['to Life', '生命'],
  ['to Mana', '法力'],
  ['to Attack Rating', '攻击准确率'],
  ['to Maximum Life', '最大生命'],
  ['to Maximum Mana', '最大法力'],
  ['Faster Cast Rate', '快速施法率'],
  ['Faster Hit Recovery', '快速打击恢复'],
  ['Faster Block Rate', '快速格挡率'],
  ['Increased Attack Speed', '提升攻击速度'],
  ['Increased Chance of Blocking', '提升格挡几率'],
  ['Chance of Crushing Blow', '压碎性打击几率'],
  ['Chance of Open Wounds', '撕开伤口几率'],
  ['Deadly Strike', '致命打击'],
  ['Cannot Be Frozen', '无法冰冻'],
  ['Increase Maximum Life', '提升最大生命'],
  ['Increase Maximum Mana', '提升最大法力'],
  ['Enhanced Damage', '增强伤害'],
  ['Enhanced Defense', '增强防御'],
  ['Defense vs. Melee', '对近战防御'],
  ['Defense vs. Missile', '对远程防御'],
  ['Damage to Demons', '对恶魔伤害'],
  ['Damage to Undead', '对不死生物伤害'],
  ['Life after each Kill', '每次击杀后恢复生命'],
  ['Life after each Hit', '每次命中后恢复生命'],
  ['Life stolen per hit', '生命偷取'],
  ['Mana stolen per hit', '法力偷取'],
  ['Replenish Life', '生命回复'],
  ['Magic Find', '魔法物品掉落几率'],
  ['Extra Gold from Monsters', '怪物额外金币'],
  ['Cannot Be Frozen', '无法冰冻'],
  ['Target Defense', '目标防御'],
  ["Monster's", '怪物的'],
  ['Knockback', '击退'],
  ['Corrupted', '已腐化'],
  ['Corrupt', '腐化'],
  ['NumSockets', '孔数'],
  ['Socketed', '已镶嵌'],
  ['Runeword', '符文之语'],
  ['Defense', '防御'],
  ['7-DAY AVG', '7 天均价'],
  ['7-day avg', '7 天均价'],
  ['24-hour avg', '24 小时均价'],
  ['season avg', '赛季均价'],
];

const TRIGGER_TEXT: Record<string, string> = {
  'on attack': '攻击时',
  'when you kill an enemy': '击杀敌人时',
  'when you die': '死亡时',
  'on striking': '击中敌人时',
  'when you level-up': '升级时',
  'on casting': '施法时',
  'when struck': '被击中时',
  'on block': '格挡时',
  'on critical hit': '造成致命一击时',
  'on pierce': '穿透敌人时',
};

const TRIGGERED_SKILL_PATTERN =
  /(\d+(?:\.\d+)?%)\s*Chance to cast level\s+(\d+)\s+(.+?)\s+(on attack|when you Kill an Enemy|when you Die|on striking|when you Level-Up|on casting|when struck|on block|on critical hit|on pierce)/gi;

const SKILL_TRANSLATIONS_LOWER = new Map(
  Object.entries(PD2_SKILL_TRANSLATIONS).map(([english, chinese]) => [english.toLowerCase(), chinese]),
);

function localizeSkillName(name: string): string {
  return SKILL_TRANSLATIONS_LOWER.get(name.trim().toLowerCase()) ?? name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTemplatePattern(template: string): { pattern: RegExp; captures: string[] } {
  const captures: string[] = [];
  const parts = template.split(/(%d%%|%d|%s|%%)/g);
  const source = parts
    .map((part) => {
      if (part === '%d%%') {
        captures.push('%d%%');
        return '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))%';
      }
      if (part === '%d') {
        captures.push('%d');
        return '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))';
      }
      if (part === '%s') {
        captures.push('%s');
        return '(.+?)';
      }
      if (part === '%%') return '%';
      return escapeRegExp(part);
    })
    .join('');

  return { pattern: new RegExp(`^${source}$`, 'i'), captures };
}

const AFFIX_TEMPLATES = [...PD2_AFFIX_TRANSLATIONS]
  .map(([english, chinese]) => ({ english, chinese, ...createTemplatePattern(english) }))
  .sort((a, b) => b.english.length - a.english.length);

function localizeAffixTemplate(text: string): string | undefined {
  for (const template of AFFIX_TEMPLATES) {
    const match = template.pattern.exec(text);
    if (!match) continue;

    let captureIndex = 1;
    return template.chinese.replace(/%d%%|%d|%s|%%/g, (placeholder) => {
      if (placeholder === '%%') return '%';
      const value = match[captureIndex++];
      if (value == null) return placeholder;
      if (placeholder === '%s') return localizeSkillName(value);
      return placeholder === '%d%%' ? `${value}%` : value;
    });
  }
  return undefined;
}

/** Translate display text, including optional API labels, while retaining unknown data. */
export function localizePd2Text(text: string | null | undefined): string {
  if (text == null) return '';

  const localizedTemplate = localizeAffixTemplate(text);
  if (localizedTemplate !== undefined) return localizedTemplate;

  const withTriggeredSkills = text.replace(
    TRIGGERED_SKILL_PATTERN,
    (_, chance: string, level: string, skill: string, trigger: string) =>
      `${TRIGGER_TEXT[trigger.toLowerCase()] ?? trigger}有${chance}几率施展等级${level}的${localizeSkillName(skill)}`,
  );
  return PHRASES.reduce((result, [english, chinese]) => result.split(english).join(chinese), withTriggeredSkills);
}

export function localizeQuality(quality: string): string {
  const names: Record<string, string> = {
    Normal: '普通',
    Superior: '优质',
    Exceptional: '扩展级',
    Elite: '精英级',
    Magic: '魔法',
    Rare: '稀有',
    Set: '套装',
    Unique: '暗金',
    Crafted: '手工制作',
    Runeword: '符文之语',
  };
  return names[quality] ?? quality;
}
