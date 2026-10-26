import { describe, expect, it } from 'vitest';
import { DEFAULT_ZONE_COLORS, validColor, zoneColors, zoneRect, zoneStyle, zoneWidth } from './appearance';

describe('corrupted-zone layout and persisted appearance', () => {
  it('defaults to a bounded 720 px strip at the monitor top centre', () => {
    expect(zoneRect(undefined, 195, { x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
      x: 600,
      y: 8,
      width: 720,
      height: 195,
    });
  });
  it('clamps saved positions, width and expansion to small screens', () => {
    expect(zoneRect(560, 400, { x: 0, y: 0, width: 320, height: 240 }, { x: 2000, y: -99 })).toEqual({
      x: 16,
      y: 0,
      width: 304,
      height: 240,
    });
    expect(zoneRect(720, 195, { x: 0, y: 0, width: 1920, height: 1080 }, { x: NaN, y: 40 }).x).toBe(600);
    expect(zoneWidth(NaN)).toBe(720);
    expect(zoneWidth(-100)).toBe(480);
    expect(zoneWidth(99999)).toBe(960);
  });
  it('does not spill outside offset monitor work areas or a one-pixel viewport', () => {
    expect(zoneRect(720, 195, { x: -1280, y: 30, width: 1280, height: 900 })).toEqual({
      x: -1000,
      y: 38,
      width: 720,
      height: 195,
    });
    expect(zoneRect(720, 195, { x: 0, y: 0, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('inherits the app theme or overrides only local card tokens with valid saved colours', () => {
    expect(zoneStyle(false, { background: '#000000' })).toEqual({});
    expect(zoneColors({ background: 'url(https://example.com)' })).toEqual(DEFAULT_ZONE_COLORS);
    expect(validColor('#Ab12Cd', '#ffffff')).toBe('#Ab12Cd');
    expect(zoneStyle(true, { text: '#123456' })).toMatchObject({
      '--surface-foreground': '#123456',
      '--surface': DEFAULT_ZONE_COLORS.background,
    });
  });
});
