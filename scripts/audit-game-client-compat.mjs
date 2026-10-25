#!/usr/bin/env node
// Offline input/query audit. No login, clipboard access, game writes or market transactions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'docs/game-client-audit-20261026.json'));
const bundle = await build({
  stdin: {
    contents: `
    export { normalizeGameItemInput } from './src/lib/game-item-input';
    export { normalizeItemForStashMatching } from './src/lib/game-stash-input';
    export { clipboardContainsValidItem } from './src/lib/item-utils';
    export { getSkillFilter, resolveCharacterSkillId } from './src/pages/price-check/lib/skill-stats';
    export { getStatKey, getTypeFromBaseType } from './src/pages/price-check/lib/utils';
    export { buildGetMarketListingQuery, buildTradeUrl } from './src/pages/price-check/lib/tradeUrlBuilder';
    export { characterSkillMap } from './src/assets/character-skills';
    export { itemTypes } from './src/common/item-types';
    export { uniqueItems, setItems, runeWords } from './src/assets/items';`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const client = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/game-client-aliases.data.json'), 'utf8'));
const report = {
  date: '2026-10-26',
  scope:
    'Offline aliases, bilingual labels, reversible mojibake, stat fields, selection, query and stash normalization. Not in-game or authenticated server validation.',
  aliases: Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v.length])),
  groups: {},
  failures: [],
  ambiguous: [],
  ambiguousTemplates: [],
};
const expect = (test, message) => {
  if (!test) throw new Error(message);
};
function check(group, label, run) {
  const counts = (report.groups[group] ??= { passed: 0, failed: 0 });
  try {
    run();
    counts.passed++;
  } catch (error) {
    counts.failed++;
    report.failures.push({ group, label, message: error.message });
  }
}
const key = (text) => text.replace(/ÿc./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const latin1 = (text) => Buffer.from(text, 'utf8').toString('latin1');
const variants = (zh, en) => [...new Set([zh, ...(/[a-z0-9]/i.test(zh) ? [] : [`${zh} ${en}`, `${zh} (${en})`])])];
function index(rows, getKey, getValue) {
  const result = new Map();
  for (const row of rows) {
    const k = getKey(row),
      values = result.get(k) ?? new Set();
    values.add(getValue(row));
    result.set(k, values);
  }
  return result;
}
function normalize(item) {
  const result = lib.normalizeGameItemInput(JSON.stringify(item));
  expect(!result.error && result.text, result.error ?? 'No item data');
  expect(lib.clipboardContainsValidItem(result.text), 'Item rejected by capture validator');
  const parsed = JSON.parse(result.text);
  expect(lib.normalizeGameItemInput(result.text).text === result.text, 'Input conversion not idempotent');
  expect(
    JSON.stringify(lib.normalizeItemForStashMatching(parsed)) === JSON.stringify(parsed),
    'Stash input differs from price-check input',
  );
  return parsed;
}
const baseIndex = index(
  client.bases,
  ([zh]) => key(zh),
  ([, en]) => en,
);
for (const [zh, en] of client.bases) {
  const ambiguous = baseIndex.get(key(zh)).size > 1;
  if (ambiguous) report.ambiguous.push({ kind: 'base', label: zh, candidates: [...baseIndex.get(key(zh))] });
  for (const label of variants(zh, en))
    for (const encoded of [label, latin1(label)])
      check('base-labels', label, () => {
        const source = { iLevel: 85, quality: 'Normal', type: encoded, stats: [] };
        if (ambiguous && label === zh) {
          expect(Boolean(lib.normalizeGameItemInput(JSON.stringify(source)).error), 'Ambiguous base silently guessed');
          return;
        }
        expect(normalize(source).type === en, `Wrong base, expected ${en}`);
      });
}
const itemIndex = index(
  client.items,
  ([kind, zh]) => `${kind}:${key(zh)}`,
  ([, , en]) => en,
);
for (const [kind, zh, en] of client.items) {
  const ambiguous = itemIndex.get(`${kind}:${key(zh)}`).size > 1;
  if (ambiguous) report.ambiguous.push({ kind, label: zh, candidates: [...itemIndex.get(`${kind}:${key(zh)}`)] });
  for (const label of variants(zh, en))
    for (const encoded of [label, latin1(label)])
      check('item-labels', `${kind}:${label}`, () => {
        const source = {
          iLevel: 85,
          quality: kind === 'Runeword' ? 'Normal' : kind,
          type: 'Ring',
          name: encoded,
          stats: [{ name: 'Strength', stat_id: 0, value: 2 }],
          ...(kind === 'Runeword' ? { isRuneword: true, runeword: encoded } : {}),
        };
        if (ambiguous && label === zh) {
          expect(Boolean(lib.normalizeGameItemInput(JSON.stringify(source)).error), 'Ambiguous item silently guessed');
          return;
        }
        const result = normalize(source);
        expect(result[kind === 'Runeword' ? 'runeword' : 'name'] === en, `Wrong ${kind}, expected ${en}`);
      });
}
const skillIndex = index(
  client.skills,
  ([zh]) => key(zh),
  ([, , id]) => id,
);
for (const [zh, en, id] of client.skills) {
  const ambiguous = skillIndex.get(key(zh)).size > 1;
  if (ambiguous) report.ambiguous.push({ kind: 'skill', label: zh, candidates: [...skillIndex.get(key(zh))] });
  for (const label of variants(zh, en))
    for (const encoded of [label, latin1(label)]) {
      const forms = [
        { name: `+2 to ${encoded}`, skill: encoded, value: 2 },
        { stat_id: 97, name: `+2 to ${encoded}`, skill: encoded, value: 2 },
        { stat_id: 201, name: 'Triggered skill', skill: encoded, level: 3, chance: 10 },
        { stat_id: 204, skill: encoded, level: 2, charges: '(3/13 聚气)' },
      ];
      for (const stat of forms)
        check('skill-labels', `${id}/${stat.stat_id}/${label}`, () => {
          const result = normalize({ iLevel: 85, quality: 'Magic', type: 'Ring', stats: [stat] });
          const filter = lib.getSkillFilter(result.stats[0]);
          if (ambiguous && label === zh) {
            expect(!filter, 'Ambiguous skill silently guessed');
            return;
          }
          const property =
            stat.stat_id === 97
              ? 'item_nonclassskill'
              : stat.stat_id === 201
                ? 'item_skillongethit'
                : stat.stat_id === 204
                  ? 'item_charged_skill'
                  : 'item_singleskill';
          expect(filter?.property === property, `Wrong property ${filter?.property}, expected ${property}`);
          expect(
            filter.params[stat.stat_id === 201 || stat.stat_id === 204 ? 1 : 0] === id,
            `Wrong skill ID, expected ${id}`,
          );
          const selected = new Set([lib.getStatKey(result.stats[0])]);
          const query = lib.buildGetMarketListingQuery(
            result,
            undefined,
            selected,
            {},
            { mode: 'softcore', ladder: 'ladder' },
          );
          expect(
            query['item.modifiers']?.$all?.some((entry) => entry.$elemMatch.name === property),
            'Query omitted known skill',
          );
        });
    }
}
for (const [zh, , id] of client.stats)
  for (const label of [zh, latin1(zh)])
    check('ordinary-stat-fields', `${id}:${zh}`, () => {
      const source = { name: label, stat_id: Number(id), value: 17, range: { min: 1, max: 20 }, corrupted: true };
      const result = normalize({ iLevel: 85, quality: 'Magic', type: 'Ring', stats: [source] }).stats[0];
      // Template-only skill labels lack identity/parameters; keep their data unavailable.
      expect(
        result.stat_id === source.stat_id && result.value === source.value && result.corrupted === true,
        'Stat ID/value/corruption changed',
      );
      expect(JSON.stringify(result.range) === JSON.stringify(source.range), 'Stat range changed');
    });
for (const [template, , id] of client.stats.filter(
  ([zh, , id]) => zh.includes('%s') && [151, 191, 195, 196, 197, 198, 199, 200, 201, 202, 203, 205].includes(id),
)) {
  const competingIds = new Set(client.stats.filter(([zh]) => zh === template).map(([, , id]) => id));
  if (competingIds.size > 1) report.ambiguousTemplates.push({ label: template, candidates: [...competingIds] });
  for (const skill of Object.values(lib.characterSkillMap).filter((s) => s.class)) {
    const label = template.replace(/%d|%s|%%/g, (token) =>
      token === '%%' ? '%' : token === '%s' ? `中文 ${skill.name}` : '3',
    );
    for (const stat_id of [undefined, id])
      check('translated-skill-templates', `${id}/${stat_id}/${skill.id}/${template}`, () => {
        const result = normalize({ iLevel: 85, quality: 'Magic', type: 'Ring', stats: [{ name: label, stat_id }] });
        const filter = lib.getSkillFilter(result.stats[0]);
        if (stat_id === undefined && competingIds.size > 1) {
          expect(!filter, 'Ambiguous template silently guessed');
          return;
        }
        expect(filter, 'Translated template did not resolve');
        expect(filter.params[id === 151 || id === 191 ? 0 : 1] === skill.id, 'Translated template changed skill');
        expect(filter.value === 3, 'Translated template changed chance/level');
      });
  }
}
for (const word of ['Charges', '聚气', '聚氣'])
  for (const skill of Object.values(lib.characterSkillMap).filter((s) => s.class))
    check('charged-skill-languages', `${word}/${skill.id}`, () => {
      const result = normalize({
        iLevel: 85,
        quality: 'Magic',
        type: 'Ring',
        stats: [{ skill: `中文 (${skill.name})`, level: 2, charges: `(3/13 ${word})` }],
      });
      const filter = lib.getSkillFilter(result.stats[0]);
      expect(
        filter?.property === 'item_charged_skill' &&
          filter.params[0] === 2 &&
          filter.params[1] === skill.id &&
          filter.value === 3,
        'Charged skill identity/count changed',
      );
    });
for (const [kind, items] of [
  ['Unique', lib.uniqueItems],
  ['Set', lib.setItems],
  ['Runeword', lib.runeWords],
])
  for (const item of items)
    check('english-fixed-item-regression', `${kind}/${item.key}`, () => {
      const input = JSON.stringify({
        iLevel: 85,
        quality: kind === 'Runeword' ? 'Normal' : kind,
        type: item.base || 'Ring',
        name: item.key,
        stats: [{ name: 'Increased Attack Speed', stat_id: 93, value: 20 }],
        ...(kind === 'Runeword' ? { isRuneword: true, runeword: item.name } : {}),
      });
      expect(lib.normalizeGameItemInput(input).text === input, 'English fixed item changed');
      expect(lib.clipboardContainsValidItem(input), 'English fixed item rejected');
    });
for (const type of lib.itemTypes)
  for (const base of type.bases.filter((b) => b.label !== 'Any'))
    check('english-base-regression', base.label, () => {
      const input = JSON.stringify({ iLevel: 85, quality: 'Normal', type: base.label, stats: [] });
      expect(lib.normalizeGameItemInput(input).text === input, 'English input changed');
      expect(lib.clipboardContainsValidItem(input), 'English base rejected');
    });
report.ambiguous = [...new Map(report.ambiguous.map((row) => [JSON.stringify(row), row])).values()];
report.unnamedCatalogueBases = lib.itemTypes.flatMap((type) =>
  type.bases.filter((base) => !base.label.trim()).map((base) => ({ type: type.typeLabel, code: base.value })),
);
report.identities = {
  bases: new Set(client.bases.map(([, en]) => en)).size,
  fixedItems: new Set(client.items.map(([kind, , en]) => `${kind}:${en}`)).size,
  skills: new Set(client.skills.map(([, , id]) => id)).size,
};
report.passed = Object.values(report.groups).reduce((sum, g) => sum + g.passed, 0);
report.failed = report.failures.length;
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, failures: report.failures.slice(0, 15) }, null, 2));
if (report.failed) process.exitCode = 1;
