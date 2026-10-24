import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Treat the supplied table as data. Read only English, corrected simplified
// Chinese and the class context needed to distinguish the two Summoning tabs.
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-skill-translations.mjs <skills.txt>');
const skills = {};
const trees = [];
let header;
let section;
let pending = '';
function flush() {
  if (!pending) return;
  const cells = pending.split('\t');
  const english = cells[header.indexOf('英文名')]?.trim();
  const chinese = cells[header.indexOf('修正简')]?.trim();
  const characterClass = cells[header.indexOf('职业')]?.trim();
  if (!english || !chinese || !/[\u3400-\u9fff]/u.test(chinese) || chinese.includes('\n')) {
    throw new Error(`Invalid ${section} row: ${pending}`);
  }
  for (const name of english.split('\n').map((value) => value.trim())) {
    if (section === 'trees') trees.push({ english: name, chinese, class: characterClass });
    else {
      if (skills[name] && skills[name] !== chinese) throw new Error(`Conflicting translation: ${name}`);
      skills[name] = chinese;
    }
  }
  pending = '';
}
for (const line of fs
  .readFileSync(input, 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)) {
  const cells = line.split('\t');
  if (cells.includes('英文名') && cells.includes('修正简')) {
    flush();
    header = cells;
    section = cells.includes('拼接键值') ? 'trees' : cells.includes('分类') ? 'skills' : undefined;
    continue;
  }
  if (!section) continue;
  if (/^\d+\t/.test(line)) {
    // A number followed by tabs can also continue a multiline source-file cell.
    if (pending && pending.split('\t').length <= header.indexOf('英文名')) {
      pending += '\n' + line;
    } else {
      flush();
      pending = line;
    }
  } else if (pending && line.includes('\t')) pending += '\n' + line;
}
flush();
if (trees.length !== 21 || Object.keys(skills).length < 210) throw new Error('Incomplete skill table');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(
  path.join(root, 'src/lib/pd2-skill-translations.data.json'),
  JSON.stringify({ skills, trees }, null, 2) + '\n',
);
console.log(JSON.stringify({ skillNames: Object.keys(skills).length, skillTrees: trees.length }));
