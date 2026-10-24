import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [unusedTable, weaponsTable, armorTable] = process.argv.slice(2);
if (!unusedTable || !weaponsTable || !armorTable) {
  throw new Error('Usage: node scripts/import-pd2-unique-supplements.mjs <unused.tsv> <weapons.txt> <armor.txt>');
}
const normalize = (name) => name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const exported = {};
// Only transpile trusted repository declarations. Uploaded documents are data.
new Function(
  'exports',
  ts.transpileModule(fs.readFileSync(path.join(root, 'src/assets/items.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(exported);
const catalog = new Map(exported.uniqueItems.map((item) => [normalize(item.name), item.name]));
const original = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/pd2-item-translations.data.json'), 'utf8'));
const existing = new Set(Object.keys(original.Unique).map(normalize));
const added = new Map();
const conflicts = [];
function add(english, chinese, source) {
  if (!english || !chinese || !/[\u3400-\u9fff]/u.test(chinese)) return;
  const key = normalize(english);
  if (!catalog.has(key) || existing.has(key)) return;
  if (added.has(key)) {
    if (added.get(key).chinese !== chinese)
      conflicts.push({ english: catalog.get(key), retained: added.get(key).chinese, alternative: chinese, source });
    return;
  }
  added.set(key, { english: catalog.get(key), chinese });
}

// Existing corrected simplified translations, then this additional corrected
// table, take precedence over the two later bilingual outlines.
const unusedLines = fs
  .readFileSync(unusedTable, 'utf8')
  .replace(/^\uFEFF/, '')
  .trim()
  .split(/\r?\n/);
const header = unusedLines.shift().split('\t');
for (const line of unusedLines) {
  const cells = line.split('\t');
  add(cells[header.indexOf('英文名')], cells[header.indexOf('修正简')], 'corrected-simplified');
}
for (const [source, file] of [
  ['weapons', weaponsTable],
  ['armor', armorTable],
]) {
  const nodes = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(\d+(?:\.\d+)*)\t(.+)$/.exec(line);
      return match && { code: match[1], body: match[2].trim() };
    })
    .filter(Boolean);
  for (const node of nodes) {
    if (nodes.some((other) => other.code.startsWith(node.code + '.'))) continue;
    const boundary = node.body.search(/[A-Za-z]/);
    if (boundary <= 0) continue;
    add(node.body.slice(boundary).trim(), node.body.slice(0, boundary).trim(), source);
  }
}

// These four outline entries have only English names. Chinese names were supplied
// separately in the user's pasted PD2 balance notes; no balance values are used.
for (const [english, chinese] of Object.entries({
  Embersworn: '余烬之誓',
  "Sage's Defiance": '贤者之抗',
  'Giant Maimer': '巨残者',
  Ephemeral: '短暂',
  Skyfall: '天降',
  Nethercrux: '幽冥核心',
}))
  add(english, chinese, 'user-balance-notes');

const Unique = Object.fromEntries(
  [...added.values()]
    .sort((a, b) => a.english.localeCompare(b.english))
    .map(({ english, chinese }) => [english, chinese]),
);
const Base = {
  'Blunt Arrows': '钝头箭',
  'Sharp Arrows': '尖头箭',
  'Razor Arrows': '剃刀箭',
  'Light Bolts': '轻型弩矢',
  'Heavy Bolts': '重型弩矢',
  'War Bolts': '战斗弩矢',
};
fs.writeFileSync(
  path.join(root, 'src/lib/pd2-item-supplements.data.json'),
  JSON.stringify({ Unique, Base }, null, 2) + '\n',
);
console.log(
  JSON.stringify({ addedUniqueNames: added.size, addedBaseNames: Object.keys(Base).length, conflicts }, null, 2),
);
