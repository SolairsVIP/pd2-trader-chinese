import { describe, expect, it } from 'vitest';
import { localizedZone, zoneText } from './language';
import { ZONES } from './schedule';

describe('corrupted zone language', () => {
  it('uses the supplied 修正简 and 原版繁 names for matching English map keys', () => {
    const zone = ZONES.find((z) => z.maps.some((m) => m.key === 'Blood Moor'))!;
    expect(localizedZone(zone, 'zh-CN').detail).toContain('鲜血荒地');
    expect(localizedZone(zone, 'zh-TW').detail).toContain('鮮血荒地');
    expect(localizedZone(zone, 'zh-TW').detail).toContain('邪惡洞窟');
  });
  it('keeps unknown PD2 maps readable without changing their identifiers', () => {
    const zone = ZONES.find((z) => z.maps.some((m) => m.key === 'Rigid Highlands'))!;
    const before = JSON.stringify(zone);
    expect(localizedZone(zone, 'zh-TW').name).toBeTruthy();
    expect(JSON.stringify(zone)).toBe(before);
    expect(zoneText('腐化区剩余时间', 'zh-TW')).toBe('腐化區剩餘時間');
  });
});
