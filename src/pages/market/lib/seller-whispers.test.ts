import { describe, expect, it } from 'vitest';
import type { WhisperPerson } from '@/lib/whisper-history';
import { sellerWhispers } from './seller-whispers';

const person = (key: string, timestamps: number[]): WhisperPerson => ({
  key, accountName: key, playerName: key, readAt: 0, trades: [],
  messages: timestamps.map((timestamp) => ({ id: String(timestamp), isIncoming: true, message: 'hi', timestamp })),
});

describe('seller whisper summary', () => {
  it('matches known game accounts case-insensitively and summarizes real local records', () => {
    const people = { first: person('seller', [100, 200]), second: person('other', [300]) };
    expect(sellerWhispers(people, ['*SeLLeR'])).toMatchObject({ count: 2, last: 200 });
    expect(sellerWhispers(people, ['nobody'])).toMatchObject({ count: 0, last: 0 });
  });
});
