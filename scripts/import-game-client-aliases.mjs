import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Read translation data only; never load or execute the game's EXE/DLL files.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [tableDir, skillTable, ...flags] = process.argv.slice(2);
const option = (name, fallback) => flags.includes(name) ? flags[flags.indexOf(name) + 1] : fallback;
const target = path.resolve(option('--output', path.join(root, 'src/lib/game-client-aliases.data.json')));
const reportTarget = path.resolve(option('--report', path.join(root, 'docs/game-client-aliases-20261024.json')));
const basesOnly = skillTable === '--bases-only';
if (!tableDir || !skillTable)
  throw new Error('Usage: node scripts/import-game-client-aliases.mjs <LNG/ENG directory> <skill-reference.tsv | --bases-only>');
const require = createRequire(import.meta.url);
function declarations(relative) {
  const exports = {};
  new Function(
    'exports',
    'require',
    ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
  )(exports, require);
  return exports;
}
const clean = (value) => value.replace(/ÿc./g, '').replace(/\s+/g, ' ').trim();
const hasChinese = (value) => /[\u3400-\u9fff]/u.test(value);
const strings = new Map();
const sources = [];
for (const name of ['string.tbl', 'expansionstring.tbl', 'patchstring.tbl']) {
  const b = fs.readFileSync(path.join(tableDir, name));
  if (b.length < 21 || b.readUInt32LE(17) !== b.length) throw new Error(`Invalid TBL header: ${name}`);
  const entries = b.readUInt16LE(2),
    count = b.readUInt32LE(4),
    start = 21 + entries * 2;
  const dataStart = b.readUInt32LE(9);
  if (start + count * 17 > dataStart || dataStart > b.length) throw new Error(`Invalid TBL index: ${name}`);
  let rows = 0;
  for (let i = 0; i < count; i++) {
    const p = start + i * 17;
    if (b[p] !== 1) continue;
    const k = b.readUInt32LE(p + 7),
      v = b.readUInt32LE(p + 11),
      n = b.readUInt16LE(p + 15);
    const end = b.indexOf(0, k);
    if (k < dataStart || end < k || end >= b.length || v < dataStart || n < 1 || v + n > b.length || b[v + n - 1] !== 0)
      throw new Error(`Invalid TBL row: ${name}/${i}`);
    const key = b.subarray(k, end).toString('latin1');
    // Legacy D2 colour markers contain a standalone 0xff, not a UTF-8 ÿ.
    const raw = b.subarray(v, v + n - 1);
    const plain = Buffer.from(
      [...raw].filter(
        (_, j) =>
          !(raw[j] === 0xff && raw[j + 1] === 0x63) &&
          !(j >= 1 && raw[j - 1] === 0xff && raw[j] === 0x63) &&
          !(j >= 2 && raw[j - 2] === 0xff && raw[j - 1] === 0x63),
      ),
    );
    let value;
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(plain);
    } catch {
      throw new Error(`Non-UTF8 TBL value: ${name}/${key}`);
    }
    strings.set(key.toLowerCase(), clean(value));
    rows++;
  }
  sources.push({ file: name, rows });
}
const lookup = (key) => strings.get(String(key).toLowerCase());
const { itemTypes } = declarations('src/common/item-types.ts');
const { uniqueItems, setItems, runeWords } = declarations('src/assets/items.ts');
const { characterSkillMap } = declarations('src/assets/character-skills.ts');
const { modifiers } = declarations('src/assets/modifiers.ts');
const uniqueRows = (rows) => [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];
// The catalogue groups normal and stackable variants with a JSON selector.
// TBL names are indexed by each concrete code, never by the selector text.
function baseKeys(value) {
  if (!value.trim().startsWith('{')) return value === 'Any' ? [] : [value];
  const selector = JSON.parse(value);
  if (!Array.isArray(selector.$in) || !selector.$in.every((code) => typeof code === 'string'))
    throw new Error(`Invalid base selector: ${value}`);
  return selector.$in;
}
const bases = uniqueRows(
  itemTypes.flatMap((type) =>
    type.bases.flatMap(({ label, value }) =>
      (label.trim() ? baseKeys(value) : []).flatMap((code) => {
        const chinese = lookup(code);
        return chinese && hasChinese(chinese) ? [[chinese, label]] : [];
      }),
    ),
  ),
);
if (basesOnly) {
  // Extend only the input aliases. Existing item, stat and skill mappings stay
  // tied to the previously verified client; no translation reference is needed.
  const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
  const before = existing.bases.length;
  existing.bases = uniqueRows([...existing.bases, ...bases]);
  fs.writeFileSync(target, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Base aliases: ${before} -> ${existing.bases.length}; other mappings preserved`);
  process.exit(0);
}
const items = uniqueRows(
  [
    ['Unique', uniqueItems],
    ['Set', setItems],
    ['Runeword', runeWords],
  ].flatMap(([kind, entries]) =>
    entries.flatMap((item) => {
      const chinese = lookup(item.key);
      return chinese && hasChinese(chinese) ? [[kind, chinese, kind === 'Runeword' ? item.name : item.key]] : [];
    }),
  ),
);
const stats = uniqueRows(
  modifiers.flatMap((modifier) => {
    const label = modifier.description?.label;
    return ['positive', 'negative'].flatMap((sign) => {
      const chinese = label?.[`${sign}_code`] && lookup(label[`${sign}_code`]);
      return chinese && hasChinese(chinese) && label[sign] ? [[chinese, label[sign], modifier.id]] : [];
    });
  }),
);
// The supplied reference explicitly corrects the expansion skillname/SK offset.
// Match its stable key to its SK id, then take the *current PD2* English skill.
const skills = uniqueRows(
  fs
    .readFileSync(skillTable, 'utf8')
    .split(/\r?\n/)
    .flatMap((line) => {
      const cells = line.split('\t');
      if (!/^skillname\d+$/i.test(cells[3] ?? '')) return [];
      const id = /^SK(\d+)$/.exec(cells[4] ?? '')?.[1];
      if (id === undefined) return [];
      const chinese = lookup(cells[3]),
        english = characterSkillMap[Number(id)]?.name;
      return chinese && hasChinese(chinese) && english ? [[chinese, english, Number(id)]] : [];
    }),
);
const data = { bases, items, stats, skills };
const mergeSource = option('--merge-from', undefined);
if (mergeSource) {
  const previous = JSON.parse(fs.readFileSync(mergeSource, 'utf8'));
  for (const group of Object.keys(data)) data[group] = uniqueRows([...previous[group], ...data[group]]);
  data.bases = data.bases.filter(([, english]) => english.trim());
}
fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
const collisions = (rows, labelIndex, targetIndex) => {
  const map = new Map();
  for (const row of rows) {
    const values = map.get(row[labelIndex]) ?? new Set();
    values.add(row[targetIndex]);
    map.set(row[labelIndex], values);
  }
  return [...map]
    .filter(([, values]) => values.size > 1)
    .map(([label, values]) => ({ label, candidates: [...values] }));
};
const report = {
  language: path.basename(tableDir),
  mergedWithExistingAliases: Boolean(mergeSource),
  sources,
  counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  ambiguousBases: collisions(data.bases, 0, 1),
  ambiguousSkills: collisions(data.skills, 0, 2),
  unnamedCatalogueBases: itemTypes.flatMap(type => type.bases.filter(base => !base.label.trim()).map(base => ({ type: type.typeLabel, code: base.value }))),
};
fs.writeFileSync(reportTarget, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
