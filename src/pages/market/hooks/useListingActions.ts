import { useRef } from 'react';
import { showToast, useOverlay } from '@/overlay';
import { openUrl } from '@/lib/browser-opener';
import { writeText } from '@/lib/browser-clipboard';
import { useChatTemplates } from '@/hooks/useChatTemplates';
import { usePd2Website } from '@/hooks/pd2website/usePD2Website';
import { fillTemplate, templatePlaceholders, type ChatTemplate } from '@/lib/message-templates';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import { verifyListing } from '../lib/freshness';
import { itemDisplayName, listingUrl, sellerAccount } from '../lib/listing';
import { buildWhisper } from '../lib/whisper';

export interface ListingActions {
  /** Copies `/w *account …` (default wording, or `template` in buildWhisper's tokens) and toasts. */
  copyWhisper: (template?: string) => Promise<void>;
  /**
   * Re-checks the listing on PD2 before acting on it. Resolves the listing to act on (PD2's current copy), or
   * null to stop: it's gone (toasted), or its price/item changed since it was shown (toasted with the new price;
   * the next call with the same change goes ahead).
   */
  ensureFresh: () => Promise<MarketListingEntry | null>;
  /** Chat panel: the seller's thread with a listing link drafted. */
  openDm: () => void;
  openWebsite: () => void;
  /** The user's chat templates usable as a whisper (no custom placeholders), tokens mapped to buildWhisper's. */
  whisperTemplates: ChatTemplate[];
}

const askingPrice = (l: MarketListingEntry) => (l.hr_price > 0 ? `${l.hr_price} HR` : l.price?.trim() || '未标价');
const changeKey = (l: MarketListingEntry) => `${l.price ?? ''}|${l.hr_price ?? ''}|${l.item?.hash ?? ''}`;

/** Whisper / message / website actions shared by the detail pane and the result cards. */
export function useListingActions(listing: MarketListingEntry): ListingActions {
  const { openPanel } = useOverlay();
  const { templates } = useChatTemplates();
  const { marketApi } = usePd2Website();
  /** The change the user was already warned about; acting again goes ahead. */
  const acknowledgedRef = useRef<string | null>(null);
  // buildWhisper falls back to the website username, as the price check does
  const account = sellerAccount(listing) || listing.user?.username || null;
  const displayName = itemDisplayName(listing.item);

  const ensureFresh = async (): Promise<MarketListingEntry | null> => {
    const check = await verifyListing(marketApi, listing);
    if (check.status === 'unknown') return listing;
    if (check.status === 'gone') {
      showToast({
        title: '挂单已不存在',
        description: `${displayName} 已在 projectdiablo2.com 售出或下架。`,
        variant: 'warning',
      });
      return null;
    }
    // PD2's copy may lack what the search row resolved (seller); keep ours for anything it doesn't carry
    const current = { ...listing, ...check.listing, user: check.listing.user ?? listing.user };
    if (check.status === 'ok') return current;
    const key = changeKey(check.listing);
    if (acknowledgedRef.current === key) return current;
    acknowledgedRef.current = key;
    showToast({
      title: '挂单已变更',
      description: `${displayName} 当前标价为 ${askingPrice(check.listing)}。再次点击即可继续。`,
      variant: 'warning',
    });
    return null;
  };

  return {
    whisperTemplates: templates
      .filter((t) => templatePlaceholders(t.text).length === 0)
      .map((t) => ({
        ...t,
        // buildWhisper fills (and sanitizes) the listing values
        text: fillTemplate(t.text, {
          itemName: '{item}',
          price: '{price}',
          accountName: '{account}',
          characterName: '',
        }),
      })),
    copyWhisper: async (template?: string) => {
      if (!account) {
        showToast({
          title: '没有游戏账号',
          description: '此挂单未提供游戏账号，无法发送密语。请改为在网站上联系卖家。',
          variant: 'warning',
        });
        return;
      }
      const current = await ensureFresh();
      if (!current) return;
      try {
        await writeText(buildWhisper(current, template));
        showToast({ title: '游戏密语已复制', description: `粘贴到游戏聊天框即可联系 *${account}。` });
      } catch {
        showToast({ title: '未能复制密语', description: '无法写入剪贴板。', variant: 'error' });
      }
    },
    ensureFresh,
    openDm: () =>
      openPanel(
        'chat',
        {
          userId: listing.user_id,
          userName: listing.user?.username ?? account ?? undefined,
          draft: `Hi! Is your ${displayName} still available? ${listingUrl(listing)}?display=${encodeURIComponent(displayName)}`,
          reply: true,
        },
        { focus: true },
      ),
    openWebsite: () => void openUrl(listingUrl(listing)),
  };
}
