import { describe, expect, it } from 'vitest';
import { ZONES } from './schedule';
import immunities from './immunities.json';
import { DAMAGE_TYPES, damageSelection, zoneRecommendation } from './recommendation';

describe('damage recommendations', () => {
  it('covers exactly the 37 known zone IDs and only the six supported damage types', () => {
    expect(Object.keys(immunities).map(Number)).toEqual(ZONES.map((z) => z.id));
    for (const values of Object.values(immunities)) {
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) expect(Object.keys(DAMAGE_TYPES)).toContain(value);
    }
  });
  it('flags lightning in Great Marsh without claiming every submap is immune', () => {
    const advice = zoneRecommendation(20, 'lightning');
    expect(advice.status).toBe('caution');
    expect(advice.detail).toContain('本组区域存在闪电免疫');
    expect(advice.detail).not.toContain('所有');
  });
  it('distinguishes damage types and missing data from a known empty immunity list', () => {
    expect(zoneRecommendation(0, 'fire').status).toBe('caution');
    expect(zoneRecommendation(0, 'lightning').status).toBe('suitable');
    for (const damage of Object.keys(DAMAGE_TYPES)) expect(zoneRecommendation(11, damage).status).toBe('suitable');
    expect(zoneRecommendation(999, 'lightning').status).toBe('unknown');
    expect(zoneRecommendation(-1, 'fire').status).toBe('unknown');
  });
  it('does not silently choose a damage type for old or invalid settings', () => {
    for (const value of [undefined, null, '', 'LIGHT', {}, 0, '__proto__']) {
      expect(damageSelection(value)).toBe('none');
      expect(zoneRecommendation(20, value).status).toBe('unselected');
    }
  });
});
