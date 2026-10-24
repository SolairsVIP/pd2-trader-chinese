import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// These are trusted repository data declarations, not the uploaded documents.
function loadData(file) {
  const exported = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  new Function('exports', outputText)(exported);
  return exported;
}
const items = loadData('src/assets/items.ts');
const catalog = loadData('src/pages/market/lib/catalog.data.ts');
const translations = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/pd2-item-translations.data.json'), 'utf8'));
const normalize = (name) => name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const groups = {
  Runeword: [...new Set(items.runeWords.map((item) => item.name))],
  Unique: [...new Set(items.uniqueItems.map((item) => item.name))],
  Set: [...new Set(items.setItems.map((item) => item.name))],
  Base: [...new Set(catalog.SITE_BASE_NAMES)],
};
const coverage = {};
for (const [kind, names] of Object.entries(groups)) {
  const lookup = new Map(Object.entries(translations[kind]).map(([english, chinese]) => [normalize(english), chinese]));
  const missing = names.filter((name) => !lookup.has(normalize(name)));
  coverage[kind] = {
    referenceNames: Object.keys(translations[kind]).length,
    catalogueNames: names.length,
    translatedCatalogueNames: names.length - missing.length,
    untranslatedCatalogueNames: missing.length,
    untranslatedNames: missing,
  };
}
fs.writeFileSync(
  path.join(root, 'docs/item-name-translation-coverage-20261024.json'),
  JSON.stringify(coverage, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    Object.fromEntries(Object.entries(coverage).map(([kind, { untranslatedNames, ...counts }]) => [kind, counts])),
    null,
    2,
  ),
);
