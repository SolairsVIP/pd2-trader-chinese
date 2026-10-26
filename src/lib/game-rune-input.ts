import client from './game-client-aliases.data.json';
import { itemTypes } from '@/common/item-types';

// These character equivalents apply only to exact rune labels, not equipment,
// skill names or arbitrary game text. Original client aliases remain unchanged.
const traditional: Record<string, string> = {
  爾: '尔',
  歐: '欧',
  圖: '图',
  盧: '卢',
  蘭: '兰',
  烏: '乌',
  瑪: '玛',
  羅: '罗',
  貝: '贝',
  舊: '旧',
};
function labelKey(text: string): string {
  return text
    .replace(/(?:ÿ|Ã¿)c./g, '')
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[爾歐圖盧蘭烏瑪羅貝舊]/g, (c) => traditional[c])
    .replace(/\s*\((?:old|旧)\)\s*$/i, '')
    .replace(/^符文\s*:?\s*/, '')
    .replace(/\s*符文$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const runeNames = itemTypes
  .find((type) => type.typeLabel === 'Rune')!
  .bases.filter((base) => base.label !== 'Any')
  .map((base) => base.label);
const aliases = new Map<string, Set<string>>();
function add(label: string, english: string) {
  const key = labelKey(label);
  const values = aliases.get(key) ?? new Set<string>();
  values.add(english);
  aliases.set(key, values);
}
for (const english of runeNames) add(english, english);
for (const [label, english] of client.bases) {
  if (!runeNames.includes(english)) continue;
  add(label, english);
  // Verified CHI aliases include "夏 Shael", "破 Io" and "喬 Jah".
  const prefix = labelKey(label).replace(new RegExp(`\\s+${english.replace(/ Rune$/, '').toLowerCase()}$`), '');
  if (/^[\u3400-\u9fff]+$/u.test(prefix)) add(prefix, english);
}
function exact(label: string): string | undefined {
  const values = aliases.get(labelKey(label));
  return values?.size === 1 ? values.values().next().value : undefined;
}

function resolveRuneType(type: string, isRune: boolean): string | undefined {
  const label = labelKey(type);
  const direct = exact(label);
  if (direct) return direct;
  // Bare English names are accepted only with the export's explicit rune flag
  // or a Chinese rune wrapper. "Lo" alone must not identify arbitrary items.
  if (isRune || /^符文|符文$/u.test(type.trim())) {
    const english = runeNames.find((name) => name.replace(/ Rune$/, '').toLowerCase() === label);
    if (english) return english;
  }
  for (const english of runeNames) {
    const short = english.replace(/ Rune$/, '').toLowerCase();
    for (const suffix of [english.toLowerCase(), `(${english.toLowerCase()})`, short, `(${short})`]) {
      if (!label.endsWith(suffix)) continue;
      const prefix = label.slice(0, -suffix.length).trim();
      if (!/[\u3400-\u9fff]/u.test(prefix) || /[a-z0-9]/i.test(prefix)) continue;
      const known = exact(prefix);
      if (known && known !== english)
        throw new Error(`符文中英文名称不一致：“${type}”。请保留复制数据反馈，避免查询到另一种符文。`);
      return english;
    }
  }
  return undefined;
}

/** Only normalize exact rune identities. Keep other English item fields intact. */
export function normalizeRuneInputTypes(source: Record<string, any>): Record<string, any> {
  const english = typeof source.type === 'string' ? resolveRuneType(source.type, source.isRune === true) : undefined;
  let result = english && english !== source.type ? { ...source, type: english } : source;
  if (Array.isArray(source.socketed)) {
    const socketed = source.socketed.map((child: unknown) => {
      if (!child || typeof child !== 'object' || Array.isArray(child)) return child;
      try {
        return normalizeRuneInputTypes(child);
      } catch {
        return child;
      }
    });
    if (socketed.some((child: unknown, i: number) => child !== source.socketed[i])) result = { ...result, socketed };
  }
  return result;
}
