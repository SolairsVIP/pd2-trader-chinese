import { PD2_ITEM_TRANSLATIONS as translations } from './pd2-item-translations';

type NameKind = keyof typeof translations;
const normalize = (name: string) => name.trim().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const dictionaries = Object.fromEntries(
  Object.entries(translations).map(([kind, names]) => [
    kind,
    new Map(Object.entries(names).map(([en, zh]) => [normalize(en), zh])),
  ]),
) as Record<NameKind, Map<string, string>>;

function kindsForQuality(quality?: string): NameKind[] {
  if (quality === 'Runeword') return ['Runeword'];
  if (quality === 'Unique' || quality === 'Set') return [quality, 'Base'];
  if (quality) return ['Base'];
  return ['Unique', 'Set', 'Runeword', 'Base'];
}

/** Display only: never write this result into item identity, API requests or outgoing messages. */
export function localizeItemName(name: string | null | undefined, quality?: string): string {
  if (!name) return name ?? '';
  const key = normalize(name);
  if (quality) {
    for (const kind of kindsForQuality(quality)) {
      const label = dictionaries[kind].get(key);
      if (label) return label;
    }
    return name;
  }
  const candidates = new Set(
    kindsForQuality()
      .map((kind) => dictionaries[kind].get(key))
      .filter(Boolean),
  );
  return candidates.size === 1 ? candidates.values().next().value! : name;
}

export function localizeBaseName(name: string | null | undefined): string {
  if (name?.trim().toLowerCase() === 'pelt') return '德鲁伊头饰';
  return localizeItemName(name, 'Base');
}

/** Website stash/listing shape; the original object and its English name stay intact. */
export function localizeMarketItemName(item: {
  name?: string;
  quality?: { name?: string };
  is_runeword?: boolean;
}): string {
  return localizeItemName(item.name, item.is_runeword ? 'Runeword' : item.quality?.name);
}

const searchAliases = new Map<string, string[]>();
for (const kind of Object.keys(translations) as NameKind[]) {
  const byChinese = new Map<string, string[]>();
  for (const [english, chinese] of Object.entries(translations[kind])) {
    const aliases = byChinese.get(chinese) ?? [];
    aliases.push(english);
    byChinese.set(chinese, aliases);
  }
  for (const [english, chinese] of Object.entries(translations[kind])) {
    searchAliases.set(`${kind}:${normalize(english)}`, [chinese, ...byChinese.get(chinese)!]);
  }
}

/** Search labels only. Picking a result still returns the catalogue's canonical English name. */
export function itemNameSearchLabels(name: string, quality?: string): string[] {
  return [name, ...kindsForQuality(quality).flatMap((kind) => searchAliases.get(`${kind}:${normalize(name)}`) ?? [])];
}
