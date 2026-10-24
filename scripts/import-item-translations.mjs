import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Input documents are data only. Select columns by their headers; never use the
// other Chinese editions, notes, codes or activation status as translations.
const kinds = ['Runeword', 'Base', 'Unique', 'Set'];
const inputs = process.argv.slice(2);
if (inputs.length !== kinds.length) {
  throw new Error(
    'Usage: node scripts/import-item-translations.mjs <runewords.txt> <bases.txt> <uniques.txt> <sets.txt>',
  );
}
const result = {};
const report = {};
for (let index = 0; index < kinds.length; index++) {
  const kind = kinds[index];
  const rows = [];
  let header;
  let pending = '';
  let pendingLine = 0;
  function flush() {
    if (!pending) return;
    const cells = pending.split('\t');
    const offset = header[0] === '序号' && /^(str|exp|pat)\t/.test(pending) ? -1 : 0;
    const english = cells[header.indexOf('英文名') + offset]?.trim();
    const chinese = cells[header.indexOf('修正简') + offset]?.trim();
    if (!english || !chinese || !/[\u3400-\u9fff]/u.test(chinese)) {
      throw new Error(`${kind}:${pendingLine}: missing English or corrected simplified column`);
    }
    if (chinese.includes('\n')) throw new Error(`${kind}:${pendingLine}: ambiguous corrected translation`);
    for (const alias of english.split(/\r?\n/)) {
      const name = alias.replace(/\s*\(PD2 wiki\)/gi, '').trim();
      if (!name || /[\u3400-\u9fff]/u.test(name))
        throw new Error(`${kind}:${pendingLine}: invalid English name ${name}`);
      rows.push([name, chinese]);
    }
    pending = '';
  }
  const lines = fs
    .readFileSync(inputs[index], 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    const cells = line.split('\t');
    if (cells.includes('英文名') && cells.includes('修正简')) {
      flush();
      header = cells;
      return;
    }
    if (!header) return;
    const rowStart = /^\d+\t(?:str|exp|pat)(?:\t|$)|^(?:str|exp|pat)\t\d+/.test(line);
    if (rowStart) {
      // A table cell can contain a newline, including the source-file column.
      const offset = header[0] === '序号' && /^(str|exp|pat)\t/.test(pending) ? -1 : 0;
      if (!pending || pending.split('\t').length > header.indexOf('修正简') + offset) {
        flush();
        pending = line;
        pendingLine = lineIndex + 1;
        return;
      }
    }
    if (pending && line.includes('\t')) pending += '\n' + line;
    else if (pending && line.trim() && !/^原版|^D2/.test(line)) pending += '\n' + line;
  });
  flush();
  const names = new Map();
  const normalizedNames = new Map();
  for (const [english, chinese] of rows) {
    const normalized = english.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();
    const previous = normalizedNames.get(normalized);
    if (previous && previous !== chinese) throw new Error(`${kind}: conflicting translation for ${english}`);
    normalizedNames.set(normalized, chinese);
    names.set(english, chinese);
  }
  result[kind] = Object.fromEntries(names);
  report[kind] = { extractedNames: rows.length, distinctNames: names.size };
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(path.join(root, 'src/lib/pd2-item-translations.data.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
