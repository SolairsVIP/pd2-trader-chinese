import { describe, expect, it } from 'vitest';
import { normalizeGameItemInput } from './game-item-input';
import { restoreGameTextEncoding } from './game-text-encoding';
import { normalizeItemForStashMatching, GameItemMatchingError } from './game-stash-input';
import type { Item } from '@/pages/price-check/lib/interfaces';
import clientAliases from './game-client-aliases.data.json';
import { itemTypes } from '@/common/item-types';
import { getTypeFromBaseType } from '@/pages/price-check/lib/utils';

const tomb = {
  iLevel: 90, location: 'Stash', name: 'Tomb Reaver', quality: 'Unique', sockets: 3,
  type: 'ç¥žç§˜ä¹‹æ–§ Cryptic Axe',
  stats: [
    { name: 'æå‡æ”»å‡»é€Ÿåº¦', stat_id: 93, value: 60 },
    { name: 'æŠ—ç«', stat_id: 39, value: 46, range: { min: 30, max: 50 } },
    { name: '% Enhanced Damage', value: 228 },
  ],
};

describe('game encoding before stash matching', () => {
  it('restores the user Tomb Reaver copy including mixed CP1252/C1 bytes', () => {
    const normalized = normalizeItemForStashMatching(tomb);
    expect(normalized.type).toBe('Cryptic Axe');
    expect(normalized.name).toBe('Tomb Reaver');
    expect(normalized.stats[0].name).toBe('Increased Attack Speed');
    expect(normalized.stats[1]).toMatchObject({ stat_id: 39, value: 46, range: { min: 30, max: 50 } });
    expect(normalized.stats[2]).toEqual(tomb.stats[2]);
    expect(normalized.sockets).toBe(3);
    expect(tomb.type).toBe('ç¥žç§˜ä¹‹æ–§ Cryptic Axe');
  });

  it.each(['Cryptic Axe', '神秘之斧 Cryptic Axe', 'ç¥žç§˜ä¹‹æ–§ Cryptic Axe'])(
    'normalizes English, Chinese and mojibake to the same base: %s', (type) => {
      expect(normalizeItemForStashMatching({ ...tomb, type }).type).toBe('Cryptic Axe');
    },
  );

  it('preserves normal English JSON byte for byte and is idempotent', () => {
    const raw = JSON.stringify({ ...tomb, type: 'Cryptic Axe', stats: [{ name: 'Increased Attack Speed', stat_id: 93, value: 60 }] }, null, 2);
    expect(normalizeGameItemInput(raw).text).toBe(raw);
    const once = normalizeGameItemInput(JSON.stringify(tomb)).text;
    expect(normalizeGameItemInput(once).text).toBe(once);
  });

  it.each(['正常中文 English', "M’avina’s Embrace", 'Café', 'ÿc1已腐化', '中文 Ã¿c1å·²è…åŒ–'])('protects intact strings: %s', (text) => {
    const result = restoreGameTextEncoding(text);
    if (text.includes('Ã¿')) expect(result).toBe('中文 ÿc1已腐化');
    else expect(result).toBe(text);
  });

  it('rejects damaged/unknown bases instead of claiming the server has not synced', () => {
    expect(() => normalizeItemForStashMatching({ ...tomb, type: 'ç¥ž? Cryptic Axe' })).toThrow(GameItemMatchingError);
    expect(() => normalizeItemForStashMatching({ ...tomb, type: '未知底材' })).toThrow(GameItemMatchingError);
    expect(() => normalizeItemForStashMatching({ ...tomb, type: 'Unknown Base' })).toThrow('无法识别装备底材');
  });

  it('never repairs invalid JSON or alters numeric/flag fields and socket order', () => {
    const invalid = '{"type":"鍔涢噺?, "quality":"Rare"}';
    expect(normalizeGameItemInput(invalid).text).toBe(invalid);
    const raw = { ...tomb, isEthereal: true, socketed: [
      { quality: 'Normal', type: 'El Rune', iLevel: 1, name: 'El Rune' },
      { quality: 'Normal', type: 'Eld Rune', iLevel: 1, name: 'Eld Rune' },
    ] };
    const normalized = normalizeItemForStashMatching(raw as Item);
    expect(normalized).toMatchObject({ iLevel: 90, isEthereal: true, quality: 'Unique', socketed: raw.socketed });
  });
});

describe('Chinese rune and grouped base input', () => {
  const runeNames = [
    ['艾尔', 'El'], ['艾德', 'Eld'], ['提尔', 'Tir'], ['奈夫', 'Nef'],
    ['艾斯', 'Eth'], ['伊司', 'Ith'], ['塔尔', 'Tal'], ['拉尔', 'Ral'],
    ['欧特', 'Ort'], ['图尔', 'Thul'], ['安姆', 'Amn'], ['索尔', 'Sol'],
    ['沙伊', 'Shael'], ['多尔', 'Dol'], ['海尔', 'Hel'], ['艾欧', 'Io'],
    ['卢姆', 'Lum'], ['科', 'Ko'], ['法尔', 'Fal'], ['兰姆', 'Lem'], ['普尔', 'Pul'],
    ['乌姆', 'Um'], ['玛尔', 'Mal'], ['伊司特', 'Ist'], ['古尔', 'Gul'],
    ['伐克斯', 'Vex'], ['欧姆', 'Ohm'], ['罗', 'Lo'], ['瑟', 'Sur'],
    ['贝', 'Ber'], ['扎哈', 'Jah'], ['查姆', 'Cham'], ['佐德', 'Zod'],
  ];

  it('has an independent fixture for every one of the 33 rune identities', () => {
    expect(runeNames).toHaveLength(33);
    expect(new Set(runeNames.map(([, en]) => en))).toEqual(new Set(
      itemTypes.find((t) => t.typeLabel === 'Rune')!.bases.filter((b) => b.label !== 'Any').map((b) => b.label.replace(/ Rune$/, '')),
    ));
  });

  it('restores the exact user copy without requiring stats or name', () => {
    const raw = { iLevel: 99, isRune: true, location: 'Stash', quality: 'Normal', type: 'ç¬¦æ–‡ï¼šå¤å°”' };
    const result = normalizeItemForStashMatching(raw as Item);
    expect(result).toEqual({ ...raw, type: 'Gul Rune' });
    expect(getTypeFromBaseType(result.type, true)?.base).toEqual({ $in: ['r25', 'r25s'] });
    expect(raw.type).toBe('ç¬¦æ–‡ï¼šå¤å°”');
  });

  it.each(runeNames)('recognizes 符文：%s as %s Rune', (zh, en) => {
    const result = normalizeGameItemInput(JSON.stringify({ iLevel: 99, isRune: true, quality: 'Normal', type: `符文：${zh}` }));
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.text!).type).toBe(`${en} Rune`);
    const mojibake = Buffer.from(`符文：${zh}`, 'utf8').toString('latin1');
    const restored = normalizeGameItemInput(JSON.stringify({ iLevel: 99, isRune: true, quality: 'Normal', type: mojibake }));
    expect(JSON.parse(restored.text!).type).toBe(`${en} Rune`);
    const english = JSON.stringify({ iLevel: 99, isRune: true, quality: 'Normal', type: `${en} Rune` }, null, 2);
    expect(normalizeGameItemInput(english).text).toBe(english);
  });

  const grouped = itemTypes.flatMap((t) => t.bases.filter((b) => b.value.startsWith('{')));
  it.each(grouped.map((b) => [b.label]))('covers imported aliases for grouped base %s', (label) => {
    const aliases = clientAliases.bases.filter(([, en]) => en === label);
    expect(aliases.length).toBeGreaterThan(0);
    for (const [type] of aliases) {
      const input = { iLevel: 99, quality: 'Normal', type };
      const result = normalizeItemForStashMatching(input as Item);
      expect(result.type).toBe(label);
      expect(getTypeFromBaseType(result.type, true)?.base).toEqual(getTypeFromBaseType(label, true)?.base);
    }
  });

  it('normalizes socketed Chinese runes while preserving their order', () => {
    const result = normalizeItemForStashMatching({ iLevel: 99, quality: 'Normal', type: 'Cryptic Axe', sockets: 2,
      socketed: [{ iLevel: 1, quality: 'Normal', isRune: true, type: '符文：古尔' },
        { iLevel: 1, quality: 'Normal', isRune: true, type: '符文：艾尔' }] } as Item);
    expect(result.socketed?.map((r) => r.type)).toEqual(['Gul Rune', 'El Rune']);
    expect(result.sockets).toBe(2);
  });

  it('rejects unknown rune labels rather than guessing a rune', () => {
    expect(() => normalizeItemForStashMatching({ iLevel: 99, isRune: true, quality: 'Normal', type: '符文：未知' } as Item)).toThrow(GameItemMatchingError);
  });
});
