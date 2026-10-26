import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { countdown, ROTATION_MS, rotationAt, upcomingRotations, zoneIndexAt, ZONES } from './schedule';

describe('corrupted-zone offline schedule', () => {
  it('preserves all 37 region identities and 118 map references supplied by Blyat', () => {
    expect(ZONES.map((z) => z.id)).toEqual(Array.from({ length: 37 }, (_, i) => i));
    expect(ZONES.flatMap((z) => z.maps)).toHaveLength(118);
    for (const zone of ZONES) {
      expect(zone.act).toBeGreaterThanOrEqual(1);
      expect(zone.act).toBeLessThanOrEqual(5);
      expect(zone.english).not.toBe('');
      expect(zone.name).not.toBe('');
      expect(zone.detail).not.toBe('');
    }
  });

  it.each([
    ['1970-01-01T00:00:00Z', 1],
    ['2026-10-25T23:59:59.999Z', 28],
    ['2026-10-26T00:00:00Z', 34],
    ['2026-12-31T23:59:59.999Z', 27],
    ['2027-01-01T00:00:00Z', 33],
    ['2028-02-29T00:00:00Z', 12],
    ['2026-10-26T12:15:00Z', 9],
  ])('matches the Int64 reference at %s', (iso, expected) => {
    expect(zoneIndexAt(Date.parse(iso))).toBe(expected);
  });

  it('matches the C# Int64 reference digest for 115,200 boundary points across 400 days', () => {
    // Reference reproduced from static IL, not from executing the supplied desktop EXE.
    // See docs/corrupted-zone.md for the independently generated reference and scope of this check.
    const start = Date.parse('2026-10-01T00:00:00Z');
    const digest = createHash('sha256');
    for (let i = 0; i < 400 * 96; i++) {
      for (const offset of [-1, 0, 1]) digest.update(`${zoneIndexAt(start + i * ROTATION_MS + offset)},`);
    }
    expect(digest.digest('hex')).toBe('940358e8c9e61efd71278a284a51c7629436f9513aeb5f2a1f3c30bfd4ed58ee');
  });

  it('changes slots exactly on the UTC quarter-hour and returns four distinct future slots', () => {
    const boundary = Date.parse('2026-10-26T00:00:00Z');
    expect(rotationAt(boundary - 1).end).toBe(boundary);
    expect(rotationAt(boundary).start).toBe(boundary);
    expect(rotationAt(boundary + 1).start).toBe(boundary);
    expect(upcomingRotations(boundary - 1).map((r) => r.start)).toEqual(
      [0, 1, 2, 3].map((n) => boundary + n * ROTATION_MS),
    );
    expect(upcomingRotations(boundary).map((r) => r.start)).toEqual(
      [1, 2, 3, 4].map((n) => boundary + n * ROTATION_MS),
    );
  });

  it('uses the instant rather than local wall time, including daylight-saving offsets', () => {
    expect(rotationAt(Date.parse('2026-10-26T08:00:00+08:00'))).toEqual(rotationAt(Date.parse('2026-10-26T00:00:00Z')));
    expect(rotationAt(Date.parse('2026-11-01T01:30:00-04:00'))).toEqual(rotationAt(Date.parse('2026-11-01T05:30:00Z')));
  });

  it('counts down without a negative value or a premature zero', () => {
    expect(countdown(900000, 0)).toBe('15:00');
    expect(countdown(900000, 899999)).toBe('00:01');
    expect(countdown(900000, 900000)).toBe('00:00');
    expect(countdown(900000, 900001)).toBe('00:00');
  });

  it.each([NaN, Infinity, -1, 8.64e15 + 1])('rejects invalid clock %s', (value) => {
    expect(() => rotationAt(value)).toThrow(RangeError);
  });
});
