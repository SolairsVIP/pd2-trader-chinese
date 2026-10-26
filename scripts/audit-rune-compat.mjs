#!/usr/bin/env node
// Offline audit of the provided client's TBL rune strings. Never runs game code,
// reads credentials, changes game files, or sends market requests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tableRoot = process.argv[2];
if (!tableRoot) throw new Error('Usage: node scripts/audit-rune-compat.mjs <LNG directory> [report.json]');
const output = path.resolve(process.argv[3] ?? path.join(root, 'docs/rune-compat-audit-20261026.json'));
const bundle = await build({ stdin: { contents: `
  export { normalizeGameItemInput } from './src/lib/game-item-input';
  export { normalizeItemForStashMatching } from './src/lib/game-stash-input';
  export { clipboardContainsValidItem } from './src/lib/item-utils';
  export { buildGetMarketListingQuery, buildTradeUrl } from './src/pages/price-check/lib/tradeUrlBuilder';
`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm' });
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const runes = 'El Eld Tir Nef Eth Ith Tal Ral Ort Thul Amn Sol Shael Dol Hel Io Lum Ko Fal Lem Pul Um Mal Ist Gul Vex Ohm Lo Sur Ber Jah Cham Zod'.split(' ');
const report = { checkedAt: new Date().toISOString(), scope: 'Offline real ENG/CHI TBL rune strings -> capture validation -> stash normalization -> market query. No live game/server verification.', sources: [], groups: {}, failures: [] };
const assert = (ok, message) => { if (!ok) throw new Error(message); };

for (const language of ['ENG', 'CHI']) {
  const labels = new Map();
  for (const name of ['string.tbl', 'expansionstring.tbl', 'patchstring.tbl']) {
    const bytes = fs.readFileSync(path.join(tableRoot, language, name));
    assert(bytes.length >= 21 && bytes.readUInt32LE(17) === bytes.length, `Invalid TBL: ${language}/${name}`);
    report.sources.push({ language, file: name, sha256: createHash('sha256').update(bytes).digest('hex') });
    const count = bytes.readUInt32LE(4), start = 21 + bytes.readUInt16LE(2) * 2;
    assert(start + count * 17 <= bytes.length, 'Invalid TBL index');
    for (let i = 0; i < count; i++) {
      const p = start + i * 17;
      if (bytes[p] !== 1) continue;
      const k = bytes.readUInt32LE(p + 7), v = bytes.readUInt32LE(p + 11), n = bytes.readUInt16LE(p + 15);
      const end = bytes.indexOf(0, k);
      assert(end >= k && v + n <= bytes.length && n > 0, 'Invalid TBL row');
      const key = bytes.subarray(k, end).toString('latin1');
      if (!/^r(?:0[1-9]|[12]\d|3[0-3])s?$/.test(key)) continue;
      // Preserve the original color marker rather than stripping it for the audit.
      const raw = Buffer.from([...bytes.subarray(v, v + n - 1)].flatMap((b, j) =>
        b === 0xff && bytes[v + j + 1] === 0x63 ? [0xc3, 0xbf] : [b]));
      labels.set(key, new TextDecoder('utf8', { fatal: true }).decode(raw));
    }
  }
  assert(labels.size === 66, `${language}: expected all 33 normal and 33 legacy/stack rune labels`);
  for (const [code, label] of labels) {
    const n = Number(code.slice(1, 3)), expected = `${runes[n - 1]} Rune`;
    const codes = [`r${String(n).padStart(2, '0')}`, `r${String(n).padStart(2, '0')}s`];
    for (const [encoding, type] of [
      ['utf8', label], ['latin1-mojibake', Buffer.from(label, 'utf8').toString('latin1')],
      ['windows1252-mojibake', new TextDecoder('windows-1252').decode(Buffer.from(label, 'utf8'))],
    ]) {
      const group = `${language}/${encoding}`;
      const counts = report.groups[group] ??= { passed: 0, failed: 0 };
      try {
        const source = { iLevel: 99, quality: 'Normal', isRune: true, quantity: 7, location: 'Stash', type };
        const result = lib.normalizeGameItemInput(JSON.stringify(source));
        assert(!result.error && result.text, result.error ?? 'No item data');
        assert(lib.clipboardContainsValidItem(result.text), 'Capture rejected the item');
        const item = JSON.parse(result.text);
        assert(item.type === expected, `Expected ${expected}, got ${item.type}`);
        assert(item.quantity === 7 && item.iLevel === 99 && item.location === 'Stash', 'Metadata changed');
        assert(JSON.stringify(lib.normalizeItemForStashMatching(item)) === JSON.stringify(item), 'Stash identity differs');
        const settings = { mode: 'softcore', ladder: 'ladder' };
        const query = lib.buildGetMarketListingQuery(item, undefined, new Set(), {}, settings);
        assert(JSON.stringify(query['item.base_code']) === JSON.stringify({ $in: codes }), 'Wrong rune code');
        assert(JSON.stringify(query['item.base.type_code']) === JSON.stringify({ $in: ['rune', 'runs'] }), 'Wrong rune category');
        const params = new URL(lib.buildTradeUrl(item, undefined, new Set(), {}, settings)).searchParams;
        assert(JSON.stringify(JSON.parse(params.get('base'))) === JSON.stringify({ $in: codes }), 'Wrong website rune code');
        counts.passed++;
      } catch (error) {
        counts.failed++;
        report.failures.push({ language, code, encoding, label, message: error.message });
      }
    }
  }
}
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ groups: report.groups, failures: report.failures, report: output }, null, 2));
if (report.failures.length) process.exitCode = 1;
