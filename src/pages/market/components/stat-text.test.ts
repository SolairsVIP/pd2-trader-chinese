import { describe, expect, it } from 'vitest';
import { statName, statWithValue, templateName } from './stat-text';

describe('stat text', () => {
  it('names templates without their placeholder', () => {
    expect(templateName('+{X}% Total Fire Resistance')).toBe('Total Fire Resistance');
    expect(templateName('+{X} Faster Cast Rate')).toBe('Faster Cast Rate');
    expect(templateName('-{X}% to Enemy Resistance (best element)')).toBe('Enemy Resistance (best element)');
    expect(templateName('+{X} to Strength')).toBe('Strength');
    expect(templateName('Regenerate Mana +{X}')).toBe('Regenerate Mana');
    expect(statName('pseudo_fire_res')).toBe('总火焰抗性');
    expect(statName('unknown_key')).toBe('unknown_key');
  });

  it('fills the value in, shortened for chips', () => {
    expect(statWithValue('pseudo_fire_res', 29)).toBe('+29% 总火焰抗性');
    expect(statWithValue('pseudo_fire_res', 29, { short: true })).toBe('+29% 总火焰抗性');
    expect(statWithValue('pseudo_total_res', 120.5, { short: true })).toBe('+120.5% 总抗性');
    expect(statWithValue('pseudo_fire_res', -5)).toBe('-5% 总火焰抗性');
    expect(statWithValue('unknown_key', 3)).toBe('unknown_key 3');
  });

  it('keeps Chinese words before an English abbreviation when removing the value', () => {
    expect(templateName('+{X} 快速施法速度（FCR）')).toBe('快速施法速度（FCR）');
    expect(templateName('火焰抗性 +{X}%')).toBe('火焰抗性');
  });
});
