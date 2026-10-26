import immunityData from './immunities.json';

export const DAMAGE_TYPES = {
  lightning: '闪电',
  cold: '冰冷',
  fire: '火焰',
  poison: '毒素',
  physical: '物理',
  magic: '魔法',
} as const;
export type DamageType = keyof typeof DAMAGE_TYPES;
export type DamageSelection = DamageType | 'none';
export const DAMAGE_CHOICES = ['none', ...Object.keys(DAMAGE_TYPES)] as DamageSelection[];
export const IMMUNITY_LABELS = {
  none: '爽刷',
  few: '可刷',
  many: '勿刷',
  unquantified: '存在免疫',
} as const;
export const IMMUNITY_SOURCE = 'https://github.com/Maaaaaarrk/Hiim-PD2-Resources/blob/main/cz-data.js';
export const RECOMMENDATION_NOTE =
  '社区免疫资料参考，按区域组合汇总，不代表每张子地图都有免疫，也不表示怪物占比。未计破免、双修、佣兵及精英额外词缀；请以游戏实况为准。';

export function damageSelection(value: unknown): DamageSelection {
  return typeof value === 'string' && DAMAGE_CHOICES.includes(value as DamageSelection)
    ? (value as DamageSelection)
    : 'none';
}

/** Presence-only community reference; deliberately does not infer density or breakability. */
export function zoneRecommendation(zoneId: number, selected: unknown) {
  const damage = damageSelection(selected);
  if (damage === 'none')
    return { status: 'unselected', label: '选伤害类型', detail: '选择角色主要伤害类型后显示免疫参考。' } as const;
  const immunities = (immunityData as Record<string, string[]>)[zoneId];
  if (!immunities)
    return { status: 'unknown', label: '资料待核对', detail: '此区域暂无免疫资料，无法判断是否适合。' } as const;
  const name = DAMAGE_TYPES[damage];
  return immunities.includes(damage)
    ? ({
        status: 'caution',
        label: IMMUNITY_LABELS.unquantified,
        detail: `${name}伤害：参考资料记录本组区域存在${name}免疫怪物，单系谨慎；没有应对免疫的手段时，建议换区或绕过。`,
      } as const)
    : ({
        status: 'suitable',
        label: IMMUNITY_LABELS.none,
        detail: `${name}伤害：参考资料未列出本组区域的常规${name}免疫，可考虑刷；精英仍可能额外免疫。`,
      } as const);
}
