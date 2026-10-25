#!/usr/bin/env node
// Local catalogue/query audit. Does not sign in, send messages or query the market.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] ?? path.join(root, 'docs/skill-audit-20261025.json'));
const bundled = await build({
  stdin: {
    contents: `
      export * from './src/pages/price-check/lib/skill-stats';
      export { characterSkillMap } from './src/assets/character-skills';
      export { classSkillsMap, classSubSkillMap, classSubSkillMap2, getSkillTabIndex } from './src/assets/class-skills';
      export { localizePd2Text } from './src/lib/localize-pd2-text';
      export { buildGetMarketListingQuery, buildTradeUrl } from './src/pages/price-check/lib/tradeUrlBuilder';
      export { getStatKey } from './src/pages/price-check/lib/utils';
      export { SITE_STAT_OPTIONS } from './src/pages/market/lib/stat-options.data';
      export { marketQueryToFilters } from './src/pages/market/store/priceCheckFilters';
      export { normalizeGameItemInput } from './src/lib/game-item-input';`,
    resolveDir: root,
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const report = {
  scope: 'Local catalogue, display, normalization, selection, official URL, API query and internal-market parameter audit. Not an in-game or remote transaction test.',
  date: '2026-10-25',
  groups: {}, failures: [], userSamples: [], internalNamesWithoutChineseDisplay: [],
};
function check(group, label, run) {
  const counts = report.groups[group] ??= { passed: 0, failed: 0 };
  try { run(); counts.passed++; }
  catch (error) { counts.failed++; report.failures.push({ group, label, error: error.message }); }
}
function expect(condition, message) { if (!condition) throw new Error(message); }
function parity(stat, property, params, valueIndex) {
  const filter = lib.getSkillFilter(stat);
  expect(filter?.property === property, `Property ${filter?.property} != ${property}`);
  expect(JSON.stringify(filter.params) === JSON.stringify(params), `Params ${filter.params} != ${params}`);
  expect(filter.valueIndex === valueIndex, 'Wrong value index');
  const normalized = lib.normalizeSkillStat(stat);
  const key = lib.getStatKey(stat);
  expect(lib.getStatKey(normalized) === key, 'Selection key changed during normalization');
  expect(JSON.stringify(lib.normalizeSkillStat(normalized)) === JSON.stringify(normalized), 'Normalization is not stable');
  const item = { quality: 'Magic', type: 'Gauntlets', iLevel: 80, stats: [stat] };
  const selected = new Set([key]);
  const ranges = { [key]: { min: '1', max: '3' } };
  const settings = { mode: 'softcore', ladder: 'ladder' };
  const query = lib.buildGetMarketListingQuery(item, undefined, selected, ranges, settings);
  const match = query['item.modifiers']?.$all?.find(entry => entry.$elemMatch.name === property)?.$elemMatch;
  expect(match, 'API query omitted skill');
  params.forEach((param, i) => expect(match[`values.${i}`] === param, 'API parameter changed'));
  expect(match[`values.${valueIndex}`]?.$gte === 1 && match[`values.${valueIndex}`]?.$lte === 3, 'API range changed');
  const propertyKey = `${property}${params.length ? `{${params.join(',')}}` : ''}`;
  const url = new URL(lib.buildTradeUrl(item, undefined, selected, ranges, settings));
  expect(url.searchParams.get(`properties[${propertyKey}][min]`) === '1', 'Official URL omitted skill/min');
  expect(url.searchParams.get(`properties[${propertyKey}][max]`) === '3', 'Official URL omitted max');
  const market = lib.marketQueryToFilters(query, false);
  expect(market.stats.some(s => s.key === propertyKey && s.min === 1 && s.max === 3), 'Internal market filter changed');
}

const playerSkills = Object.values(lib.characterSkillMap).filter(s => s.class);
for (const skill of Object.values(lib.characterSkillMap)) {
  check('canonical-skill-identities', `${skill.id}:${skill.name}`, () => {
    expect(lib.resolveCharacterSkillId(skill.name) === skill.id, 'Canonical skill ID changed');
    parity({ stat_id: 107, name: `+2 to ${skill.name}`, skill: skill.name, value: 2 }, 'item_singleskill', [skill.id], 1);
  });
  if (lib.localizePd2Text(skill.name) === skill.name) report.internalNamesWithoutChineseDisplay.push({ id: skill.id, name: skill.name });
}
for (const skill of playerSkills) {
  for (const stat_id of [undefined, 97, 107]) {
    for (const name of [`+2 to ${skill.name}`, `to ${skill.name}`, skill.name]) {
      check('player-direct-formats', `${skill.id}/${stat_id}/${name}`, () =>
        parity({ stat_id, name, skill: skill.name, value: 2 }, stat_id === 97 ? 'item_nonclassskill' : 'item_singleskill', [skill.id], 1));
    }
  }
  check('player-chinese-display', skill.name, () => expect(lib.localizePd2Text(skill.name) !== skill.name, 'Missing player translation'));
  const triggers = { 195: 'on attack', 196: 'when you kill an enemy', 197: 'when you die', 198: 'on striking', 199: 'when you level-up', 200: 'on casting', 201: 'when struck', 202: 'on block', 203: 'on critical hit', 205: 'on pierce' };
  for (const [id, suffix] of Object.entries(triggers)) {
    check('trigger-skills', `${skill.id}/${id}`, () => {
      const stat = { name: `10% Chance to cast level 3 ${skill.name} ${suffix}`, skill: skill.name, chance: 10, level: 3 };
      const explicit = { ...stat, stat_id: Number(id) };
      const property = lib.getSkillFilter(explicit)?.property;
      expect(property, 'Missing trigger property');
      parity(stat, property, [3, skill.id], 2);
      parity(explicit, property, [3, skill.id], 2);
    });
  }
  for (const [stat_id, property] of [[151, 'item_aura'], [191, 'item_skillonequip'], [204, 'item_charged_skill']]) {
    check('aura-equipped-charged', `${skill.id}/${stat_id}`, () => {
      const stat = { stat_id, name: `Level 2 ${skill.name}`, skill: skill.name, level: 2 };
      if (stat_id === 204) stat.charges = '(3/13 Charges)';
      parity(stat, property, stat_id === 204 ? [2, skill.id] : [skill.id], stat_id === 204 ? 2 : 1);
    });
  }
}
for (const entry of Object.values(lib.classSkillsMap)) {
  for (const stat_id of [undefined, 83, 107]) {
    for (const name of [entry.name, `to ${entry.name.replace('Skills', 'Skill Levels')}`, 'to Amazon Skill Levels']) {
      check('class-bonuses', `${entry.id}/${stat_id}/${name}`, () =>
        parity({ stat_id, name, skill: entry.name, value: 2 }, 'item_addclassskills', [entry.id], 1));
    }
  }
}
for (const entry of [...Object.values(lib.classSubSkillMap), ...Object.values(lib.classSubSkillMap2)]) {
  for (const stat_id of [undefined, 188, 107]) {
    for (const name of [entry.name, entry.name.replace(')', ' Only)')]) {
      check('skill-tree-formats', `${entry.id}/${stat_id}/${name}`, () => {
        const stat = { stat_id, name: `to ${name}`, skill: name, value: 2 };
        const collision = lib.resolveCharacterSkillId(name);
        if (collision !== undefined && stat_id === undefined) expect(!lib.getSkillFilter(stat), 'Guessed a kind for an ambiguous short label');
        else if (collision !== undefined && stat_id === 107) parity(stat, 'item_singleskill', [collision], 1);
        else parity(stat, 'item_addskill_tab', [lib.getSkillTabIndex(entry.id)], 1);
      });
    }
  }
}
const skillCatalogue = lib.SITE_STAT_OPTIONS.filter(([key]) => /^item_(?:addclassskills|addskill_tab|singleskill|nonclassskill|aura)\{/.test(key));
for (const [key, label] of skillCatalogue) {
  check('market-picker-identities', key, () => {
    const [, property, rawId] = /^(\w+)\{(\d+)\}$/.exec(key);
    const id = Number(rawId), name = label.replaceAll('{X}', '2');
    let stat;
    if (property === 'item_addskill_tab') {
      const [, cls, tab] = /^\+2 to (\w+) (.+)$/.exec(name);
      stat = { stat_id: 188, name, skill: `${tab} (${cls})`, value: 2 };
    } else if (property === 'item_aura') stat = { stat_id: 151, name, skill: /^Level 2 (.+) Aura When Equipped$/.exec(name)[1], level: 2 };
    else stat = { stat_id: { item_addclassskills: 83, item_singleskill: 107, item_nonclassskill: 97 }[property], name, value: 2 };
    parity(stat, property, [id], 1);
    expect(lib.localizePd2Text(label) !== label, 'Untranslated picker label');
  });
}
for (const [index, element] of ['Cold', 'Fire', 'Lightning', 'Poison', 'Magic'].entries()) {
  for (const stat_id of [126, 362 + index]) check('element-bonuses', `${element}/${stat_id}`, () =>
    parity({ stat_id, name: `+2 to ${element} Skills`, value: 2 }, `item_elemskill_${element.toLowerCase()}`, [], 1));
}
const cases = [
  { name: '+%d to Javelin and Spear Skills', skill: 'Javalin and Spear Skills (Amazon)', value: 2 },
  { name: 'to Amazon Skill Levels', skill: 'Assassin Skills', value: 2 },
];
for (const [index, stat] of cases.entries()) {
  check('user-reproductions', String(index), () => parity(stat, index === 0 ? 'item_addskill_tab' : 'item_addclassskills', [index === 0 ? 2 : 6], 1));
  const normalized = lib.normalizeSkillStat(stat);
  report.userSamples.push({ source: stat, normalized, chinese: lib.localizePd2Text(normalized.name), filter: lib.getSkillFilter(normalized) });
}
for (const stat of [
  { name: '+2 to Telepor', skill: 'Telepor', value: 2 },
  { name: '+2 to Teleport', skill: 'Unknown Skill', value: 2 },
  { name: 'Combat Skills', skill: 'Combat Skills', stat_id: 188, value: 2 },
  { name: 'Fire Skills', skill: 'Fire Skills', stat_id: 188, value: 2 },
  { name: 'Chance to cast', skill: 'Fire Ball', stat_id: 195, value: 2 },
  { name: 'Level 2 Teleport', skill: 'Teleport', stat_id: 204, level: 2, charges: '(14/13 Charges)' },
  { name: 'Charged Skill', skill: 'Teleport', charges: '(3/13 Charges)', value: 2 },
]) check('incomplete-ambiguous-data', JSON.stringify(stat), () => expect(!lib.getSkillFilter(stat), 'Invented a filter for unresolved data'));

for (const name of ['Javalin and Spear Skills (Amazon)', 'Javalin and Spear (Amazon Only)', 'Combat Masteries Skills (Barbarian)', 'Shape-Shifting Spells (Druid)', 'Shapeshifting Skills (Druid)']) {
  const id = /Javalin/.test(name) ? 2 : /Masteries/.test(name) ? 33 : 41;
  check('verified-name-variants', name, () => {
    parity({ name: `+2 to ${name}`, skill: name, value: 2, stat_id: 188 }, 'item_addskill_tab', [id], 1);
    expect(lib.localizePd2Text(name) !== name, 'Untranslated name variant');
  });
}
for (const skill of playerSkills) check('no-skill-field', skill.name, () =>
  parity({ stat_id: 107, name: `to ${skill.name}`, value: 2 }, 'item_singleskill', [skill.id], 1));
for (const entry of Object.values(lib.classSkillsMap)) check('no-skill-field', entry.name, () =>
  parity({ stat_id: 83, name: `to ${entry.name.replace('Skills', 'Skill Levels')}`, value: 2 }, 'item_addclassskills', [entry.id], 1));

const reference = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/pd2-skill-translations.data.json'), 'utf8'));
for (const [index, tree] of reference.trees.entries()) {
  check('chinese-skill-trees', tree.english, () => {
    const input = { quality: 'Magic', type: 'Gauntlets', iLevel: 80, stats: [{ stat_id: 188, name: tree.chinese, skill: `${tree.chinese}（${tree.class}）`, value: 2 }] };
    const result = lib.normalizeGameItemInput(JSON.stringify(input));
    expect(!result.error, result.error);
    parity(JSON.parse(result.text).stats[0], 'item_addskill_tab', [lib.getSkillTabIndex(index)], 1);
  });
}
const officialPath = path.join(root, 'docs/official-skill-tabs-20261025.json');
if (fs.existsSync(officialPath)) {
  const samples = JSON.parse(fs.readFileSync(officialPath, 'utf8').replace(/^\uFEFF/, ''));
  report.officialSampleTrees = new Set(samples.map(s => s.values[0])).size;
  for (const sample of samples) check('official-tab-samples', sample.label, () => {
    const filter = lib.getSkillFilter({ name: sample.label });
    expect(filter?.property === sample.name && filter.params[0] === sample.values[0] && filter.value === sample.values[1], 'Official modifier differs from local interpretation');
  });
}

const client = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/game-client-aliases.data.json'), 'utf8'));
const aliases = new Map();
for (const [chinese, , id] of client.skills) {
  const ids = aliases.get(chinese) ?? new Set(); ids.add(Number(id)); aliases.set(chinese, ids);
}
for (const [chinese, ids] of aliases) {
  if (ids.size !== 1) continue;
  const id = [...ids][0];
  if (!lib.characterSkillMap[id]) continue;
  check('chinese-game-skill-aliases', chinese, () => {
    const input = { quality: 'Magic', type: 'Gauntlets', iLevel: 80, stats: [{ stat_id: 107, name: chinese, skill: chinese, value: 2 }] };
    const result = lib.normalizeGameItemInput(JSON.stringify(input));
    expect(!result.error, result.error);
    const normalized = JSON.parse(result.text).stats[0];
    parity(normalized, 'item_singleskill', [id], 1);
  });
}
report.catalogue = { allCanonicalNames: Object.keys(lib.characterSkillMap).length, playerSkills: playerSkills.length, classes: 7, skillTrees: 21, marketSkillEntries: skillCatalogue.length };
report.passed = Object.values(report.groups).reduce((sum, group) => sum + group.passed, 0);
report.failed = report.failures.length;
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, failures: report.failures.slice(0, 15), internalNamesWithoutChineseDisplay: report.internalNamesWithoutChineseDisplay.length }, null, 2));
if (report.failed) process.exitCode = 1;
