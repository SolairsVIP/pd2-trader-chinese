import { Converter } from 'opencc-js';
import translations from './area-translations.json';
import type { CorruptedZone } from './schedule';

export type UiLanguage = 'zh-CN' | 'zh-TW';
const traditional = Converter({ from: 'cn', to: 'tw' });
const areaMap: Record<string, { simplified: string; traditional: string }> = translations;

/** Display-only conversion; never use this for identifiers or user-authored messages. */
export function zoneText(text: string, language?: UiLanguage): string {
  if (language !== 'zh-TW') return text;
  return traditional(text).replace(/賬號/g, '帳號').replace(/賬戶/g, '帳戶');
}

/** Match by the existing English map key, falling back to the existing name for PD2-only areas. */
export function localizedZone(zone: CorruptedZone, language?: UiLanguage): { name: string; detail: string } {
  const pairs = zone.maps.map((map) => {
    const match = areaMap[map.key.trim().toLowerCase()];
    return {
      original: map.name,
      name: match ? match[language === 'zh-TW' ? 'traditional' : 'simplified'] : zoneText(map.name, language),
    };
  });
  // Only replace names which are present in this zone; do not infer unrelated map names.
  const ordered = [...pairs].sort((a, b) => b.original.length - a.original.length);
  let name = '';
  for (let i = 0; i < zone.name.length; ) {
    const match = ordered.find((pair) => pair.original && zone.name.startsWith(pair.original, i));
    if (match) {
      name += match.name;
      i += match.original.length;
    } else {
      name += zoneText(zone.name[i], language);
      i++;
    }
  }
  return { name, detail: pairs.map((pair) => pair.name).join('、') };
}
