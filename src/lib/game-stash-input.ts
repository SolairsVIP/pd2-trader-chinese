import { normalizeGameItemInput } from './game-item-input';
import { getTypeFromBaseType } from '@/pages/price-check/lib/utils';
import type { Item } from '@/pages/price-check/lib/interfaces';

export class GameItemMatchingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameItemMatchingError';
  }
}

// Run at every stash lookup, including records loaded from an older queue.
// Website objects must never pass through this game-input conversion.
export function normalizeItemForStashMatching(item: Item): Item {
  const result = normalizeGameItemInput(JSON.stringify(item));
  if (result.error || !result.text)
    throw new GameItemMatchingError(result.error || '无法读取装备数据，请在游戏中重新复制。');
  const normalized: Item = JSON.parse(result.text);
  if (typeof normalized.type !== 'string' || !getTypeFromBaseType(normalized.type))
    throw new GameItemMatchingError(
      `无法识别装备底材“${normalized.type ?? ''}”。请重新复制装备数据；编码损坏无法还原时，请保留原始文本反馈。`,
    );
  return normalized;
}
