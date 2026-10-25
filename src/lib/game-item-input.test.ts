import { describe, expect, it } from 'vitest';
import { normalizeGameItemInput } from './game-item-input';
import { restoreGameTextEncoding } from './game-text-encoding';
import { normalizeItemForStashMatching, GameItemMatchingError } from './game-stash-input';
import type { Item } from '@/pages/price-check/lib/interfaces';

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
