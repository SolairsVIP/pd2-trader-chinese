import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  stdin: {
    contents: `export { localizePd2Text } from './src/lib/localize-pd2-text';
      export { SITE_STAT_OPTIONS } from './src/pages/market/lib/stat-options.data';
      export { PD2_SKILL_TRANSLATIONS } from './src/lib/pd2-skill-translations';`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { localizePd2Text, SITE_STAT_OPTIONS, PD2_SKILL_TRANSLATIONS } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const skills = SITE_STAT_OPTIONS.filter(([key]) =>
  /^item_(?:addclassskills|addskill_tab|singleskill|nonclassskill|elemskill_|allskills|aura|skillonequip|skillon|charged_skill)/.test(key),
);
const labels = skills.map(([key, english]) => ({ key, english, chinese: localizePd2Text(english) }));
const untranslated = labels.filter(({ chinese }) => /[a-z]/i.test(chinese.replace(/\{X\}/g, '')));
const report = {
  scope: 'Static market skill labels only; does not imply game or API integration coverage.',
  displayDictionaryNames: Object.keys(PD2_SKILL_TRANSLATIONS).length,
  marketSkillLabels: labels.length,
  untranslatedCount: untranslated.length,
  untranslated,
  labels,
};
fs.writeFileSync(path.join(root, 'docs/skill-translation-coverage-20261024.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, labels: undefined }, null, 2));
