import type { MarketFavorite } from './types';

const key = (userId: string) => `pd2-market-local-favorites-v1:${encodeURIComponent(userId)}`;
export const LOCAL_FAVORITES_MAX = 500;

/** Account-scoped listing snapshots, never login tokens. Null means no local fallback yet. */
export function readLocalFavorites(userId: string): MarketFavorite[] | null {
  if (!userId) return null;
  const raw = localStorage.getItem(key(userId));
  if (raw === null) return null;
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.some((f) => !f || f.user_id !== userId ||
      typeof f._id !== 'string' || typeof f.listing_id !== 'string' || typeof f.seller_id !== 'string' ||
      typeof f.created_at !== 'string' || !f.listing || f.listing._id !== f.listing_id)) throw new Error();
    return rows;
  } catch {
    throw new Error('本机收藏数据无法读取，请保留数据并联系中文版开发者。');
  }
}

export function saveLocalFavorites(userId: string, favorites: MarketFavorite[]): MarketFavorite[] {
  if (!userId) throw new Error('尚未确认当前账号，请稍后再收藏。');
  if (favorites.some((f) => !f.listing || f.listing._id !== f.listing_id)) {
    throw new Error('部分官网收藏缺少物品信息，暂时无法转存本机，请稍后重试。');
  }
  const unique = [...new Map(favorites.map((f) => [f.listing_id, f])).values()];
  if (unique.length > LOCAL_FAVORITES_MAX) throw new Error('本机收藏已达 500 件，请先取消部分收藏。');
  const rows = unique.map((f) => ({ ...f, _id: `local:${f.listing_id}`, user_id: userId }));
  try {
    localStorage.setItem(key(userId), JSON.stringify(rows));
  } catch {
    throw new Error('本机收藏保存失败，请检查可用存储空间后重试。');
  }
  return rows;
}
