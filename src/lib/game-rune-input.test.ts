import { describe, expect, it } from 'vitest';
import { normalizeGameItemInput } from './game-item-input';
import { normalizeItemForStashMatching } from './game-stash-input';
import { clipboardContainsValidItem } from './item-utils';
import { buildGetMarketListingQuery, buildTradeUrl } from '@/pages/price-check/lib/tradeUrlBuilder';
import { marketQueryToFilters } from '@/pages/market/store/priceCheckFilters';
import { SITE_ITEM_TYPES } from '@/pages/market/lib/catalog.data';
import type { Item } from '@/pages/price-check/lib/interfaces';

// Independent ordered fixtures: rune numbers are not taken from production aliases.
const runes: [string, string, string][] = [
  ['El', '艾尔', '艾爾'],
  ['Eld', '艾德', '艾德'],
  ['Tir', '提尔', '提爾'],
  ['Nef', '奈夫', '奈夫'],
  ['Eth', '艾斯', '艾斯'],
  ['Ith', '伊司', '伊司'],
  ['Tal', '塔尔', '塔爾'],
  ['Ral', '拉尔', '拉爾'],
  ['Ort', '欧特', '歐特'],
  ['Thul', '图尔', '圖爾'],
  ['Amn', '安姆', '安姆'],
  ['Sol', '索尔', '索爾'],
  ['Shael', '沙伊', '沙伊'],
  ['Dol', '多尔', '多爾'],
  ['Hel', '海尔', '海爾'],
  ['Io', '艾欧', '艾歐'],
  ['Lum', '卢姆', '盧姆'],
  ['Ko', '科', '科'],
  ['Fal', '法尔', '法爾'],
  ['Lem', '兰姆', '蘭姆'],
  ['Pul', '普尔', '普爾'],
  ['Um', '乌姆', '烏姆'],
  ['Mal', '玛尔', '瑪爾'],
  ['Ist', '伊司特', '伊司特'],
  ['Gul', '古尔', '古爾'],
  ['Vex', '伐克斯', '伐克斯'],
  ['Ohm', '欧姆', '歐姆'],
  ['Lo', '罗', '羅'],
  ['Sur', '瑟', '瑟'],
  ['Ber', '贝', '貝'],
  ['Jah', '扎哈', '扎哈'],
  ['Cham', '查姆', '查姆'],
  ['Zod', '佐德', '佐德'],
];
const mode = { mode: 'softcore', ladder: 'ladder' };
const noMapped = undefined as unknown as Parameters<typeof buildGetMarketListingQuery>[1];

function checkRune(type: string, english: string, number: number, isRune?: boolean) {
  const raw = { iLevel: 99, quality: 'Normal', location: 'Stash', quantity: 8, type, ...(isRune ? { isRune } : {}) };
  const normalized = normalizeGameItemInput(JSON.stringify(raw));
  expect(normalized.error, type).toBeUndefined();
  expect(clipboardContainsValidItem(normalized.text!), type).toBe(true);
  const item: Item = JSON.parse(normalized.text!);
  expect(item).toEqual({ ...raw, type: `${english} Rune` });
  expect(normalizeItemForStashMatching(item)).toEqual(item);
  expect(normalizeGameItemInput(normalized.text!).text).toBe(normalized.text);
  const codes = [`r${String(number).padStart(2, '0')}`, `r${String(number).padStart(2, '0')}s`];
  const query = buildGetMarketListingQuery(item, noMapped, new Set(), {}, mode);
  expect(query['item.base.type_code']).toEqual({ $in: ['rune', 'runs'] });
  expect(query['item.base_code']).toEqual({ $in: codes });
  const market = marketQueryToFilters({ ...query }, false);
  expect(JSON.parse(market.typeCode!)).toEqual({ $in: ['rune', 'runs'] });
  expect(JSON.parse(market.baseCode!)).toEqual({ $in: codes });
  const marketType = SITE_ITEM_TYPES.find((type) => type.code === market.typeCode);
  expect(marketType?.bases.find((base) => base.code === market.baseCode)?.label).toBe(`${english} Rune`);
  const params = new URL(buildTradeUrl(item, noMapped, new Set(), {}, mode)).searchParams;
  expect(JSON.parse(params.get('base')!)).toEqual({ $in: codes });
  expect(JSON.parse(params.get('type')!)).toEqual({ $in: ['rune', 'runs'] });
}

describe('rune capture through market query', () => {
  it.each(runes.map((row, i): [string, string, string, number] => [...row, i + 1]))(
    'covers all input forms for %s Rune',
    (en, zh, traditional, number) => {
      for (const type of [
        `${en} Rune`,
        `ÿc8${en} Rune`,
        `ÿc8${en} Runeÿc0`,
        `ÿc8${en} Rune (old)`,
        `ÿc8${en} Rune (旧)`,
        `ÿc8${en} Rune (舊)`,
        `符文：${zh}`,
        `符文:${zh}`,
        `符文 ： ${zh}`,
        `${zh}符文`,
        `符文：${traditional}`,
        `符文：${zh} ${en}`,
        `符文：${zh} (${en} Rune)`,
      ])
        checkRune(type, en, Number(number));
      checkRune(zh, en, Number(number), true);
      checkRune(en, en, Number(number), true);
      checkRune(Buffer.from(`符文：${zh}`, 'utf8').toString('latin1'), en, Number(number), true);
    },
  );

  it.each([
    ['夏 Shael', 'Shael', 13],
    ['破 Io', 'Io', 16],
    ['喬 Jah', 'Jah', 31],
  ] as const)('recognizes actual CHI table label %s with color markers', (type, en, number) => {
    checkRune(`ÿc8${type}`, en, number);
    checkRune(Buffer.from(`ÿc8${type}`, 'utf8').toString('latin1'), en, number);
  });

  it.each(['符文：古尔 Ber Rune', '符文：贝 Gul', '符文：未知', '符文：古?', '未知 Rune', 'Ber Rune extra'])(
    'does not guess a conflicting or damaged rune: %s',
    (type) => {
      const result = normalizeGameItemInput(JSON.stringify({ iLevel: 99, quality: 'Normal', isRune: true, type }));
      expect(Boolean(result.error) || !clipboardContainsValidItem(result.text!), type).toBe(true);
    },
  );

  it('preserves plain English JSON byte for byte and leaves rune-named equipment intact', () => {
    for (const type of ['Ber Rune', 'Rune Bow', 'Rune Sword', 'Rune Staff', 'Rune Scepter']) {
      const raw = JSON.stringify({ iLevel: 85, quality: 'Normal', type }, null, 2);
      expect(normalizeGameItemInput(raw).text).toBe(raw);
    }
  });

  it('normalizes colored socket contents without losing order or changing parent stats', () => {
    const raw = {
      iLevel: 80,
      quality: 'Normal',
      type: 'Crystal Sword',
      sockets: 3,
      stats: [{ name: 'Increased Attack Speed', stat_id: 93, value: 20 }],
      socketed: [
        { iLevel: 1, quality: 'Normal', type: 'ÿc8Ber Rune' },
        { iLevel: 1, quality: 'Normal', type: 'ÿc8Ist Rune (old)' },
        { iLevel: 1, quality: 'Normal', type: '符文：未知' },
      ],
    };
    const result = normalizeGameItemInput(JSON.stringify(raw));
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.text!)).toEqual({
      ...raw,
      socketed: [{ ...raw.socketed[0], type: 'Ber Rune' }, { ...raw.socketed[1], type: 'Ist Rune' }, raw.socketed[2]],
    });
  });
});
