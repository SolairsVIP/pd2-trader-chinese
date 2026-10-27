import { normalizeName, type WhisperPerson } from '@/lib/whisper-history';

/** Only match verified game accounts; website names and character names may belong to someone else. */
export function sellerWhispers(people: Record<string, WhisperPerson>, accounts: readonly (string | null | undefined)[]) {
  const known = new Set(accounts.map(normalizeName).filter(Boolean));
  const matches = Object.values(people).filter((person) =>
    [person.accountName, person.key].some((name) => !!normalizeName(name) && known.has(normalizeName(name))),
  );
  return {
    people: matches,
    count: matches.reduce((sum, person) => sum + person.messages.length, 0),
    last: Math.max(0, ...matches.flatMap((person) => person.messages.map((message) => message.timestamp))),
  };
}
