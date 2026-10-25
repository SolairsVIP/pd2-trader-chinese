// A game CF_TEXT copy can contain UTF-8 bytes read as Latin-1 or Windows-1252.
// Invert that byte mapping only when it produces strict UTF-8 containing CJK.
// Never repair JSON syntax or guess bytes lost as '?' / U+FFFD.
const windows1252 = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const byteRuns = /[\u0000-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]+/g;

export function restoreGameTextEncoding(text: string): string {
  return text.replace(byteRuns, (run) => {
    const bytes = Uint8Array.from(Array.from(run, (c) => windows1252.get(c.codePointAt(0)!) ?? c.charCodeAt(0)));
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (!/[\u3400-\u9fff]/u.test(decoded)) return run;
      // Explicitly require a lossless UTF-8 round trip, including C1 bytes.
      const encoded = new TextEncoder().encode(decoded);
      return encoded.length === bytes.length && encoded.every((b, i) => b === bytes[i]) ? decoded : run;
    } catch {
      return run;
    }
  });
}

/** Values only: object keys, numbers, flags and array order are untouched. */
export function restoreGameItemStrings(value: unknown): any {
  if (typeof value === 'string') return restoreGameTextEncoding(value);
  if (Array.isArray(value)) return value.map(restoreGameItemStrings);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restoreGameItemStrings(v)]));
  return value;
}
