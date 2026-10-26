import zoneData from './zones.json';

export const ROTATION_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CorruptedZone {
  id: number;
  act: number;
  english: string;
  name: string;
  detail: string;
  maps: { id: number; key: string; name: string }[];
}

/** Region names supplied by Blyat; see docs/corrupted-zone.md for provenance. */
export const ZONES: readonly CorruptedZone[] = zoneData;

/**
 * Port of ZoneAt(Int64) in the user-supplied PD2腐化区域.exe (static IL inspection).
 * The seed uses the UTC quarter-hour index plus the UTC day index since 1970-01-01.
 * Keep the full integer product: this algorithm does NOT wrap the LCG at 32 bits.
 */
export function zoneIndexAt(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 8.64e15) {
    throw new RangeError('Invalid schedule timestamp');
  }
  const slot = Math.floor(timestamp / ROTATION_MS);
  const day = Math.floor(slot / (DAY_MS / ROTATION_MS));
  // BigInt also keeps distant JS Date values exact, matching the original Int64 operations.
  return Number((((BigInt(slot + day) * 214013n + 2531011n) / 65536n) % 32768n) % 37n);
}

export function rotationAt(timestamp: number) {
  const start = Math.floor(timestamp / ROTATION_MS) * ROTATION_MS;
  const zone = ZONES[zoneIndexAt(timestamp)];
  return { start, end: start + ROTATION_MS, zone };
}

export function upcomingRotations(timestamp: number, count = 4) {
  const { end } = rotationAt(timestamp);
  return Array.from({ length: count }, (_, i) => rotationAt(end + i * ROTATION_MS));
}

export function countdown(end: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function localTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
