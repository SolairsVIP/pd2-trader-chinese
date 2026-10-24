import React from 'react';
import { localizeMarketItemName } from '@/lib/localize-item-name';
import { ChevronRight, Store, User as UserIcon } from 'lucide-react';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ListingThumb, nameColor } from '@/pages/chat/components/ListingCard';
import type { TraderPresence } from '@/pages/chat/hooks/useTraderProfile';
import { DealBadge } from './DealBadge';
import { useSellerContext } from './useSellerContext';
import { useDealIndicators } from './useDealIndicators';

/** Same tones as the chat Trader sidebar's presence dot. */
const PRESENCE_TONE: Record<TraderPresence['kind'], string> = {
  ingame: 'bg-success shadow-[0_0_6px] shadow-success/60',
  online: 'bg-warning',
  seen: 'bg-muted-foreground/50',
  unknown: 'bg-muted-foreground/30',
};

const priceText = (listing: MarketListingEntry) => (listing.hr_price > 0 ? `${listing.hr_price} HR` : listing.price);

/**
 * Detail-pane seller block: name + in-game account, presence (in game / online / last seen), account age, and
 * their other live listings (click selects one; `onBrowseSeller` opens a search for all of them).
 * Host mounts a TooltipProvider (deal badges).
 */
export function SellerCard({
  listing,
  onSelectListing,
  onBrowseSeller,
  className,
}: {
  listing: MarketListingEntry;
  onSelectListing?: (listing: MarketListingEntry) => void;
  onBrowseSeller?: () => void;
  className?: string;
}) {
  const seller = useSellerContext(listing);
  const deals = useDealIndicators(seller.others);

  let others: React.ReactNode;
  if (seller.status === 'loading') {
    others = (
      <div aria-busy
        className="space-y-1">
        <span className="sr-only">正在加载卖家挂单…</span>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i}
            className="h-8 rounded-md" />
        ))}
      </div>
    );
  } else if (seller.status === 'error') {
    others = <div className="text-xs text-muted-foreground">无法加载卖家的其他挂单。</div>;
  } else if (seller.status === 'ready' && seller.others.length === 0) {
    others = <div className="text-xs text-muted-foreground">卖家没有其他在售挂单。</div>;
  } else if (seller.others.length > 0) {
    others = (
      <ul className="space-y-0.5">
        {seller.others.map((other) => (
          <li key={other._id}>
            <button
              type="button"
              disabled={!onSelectListing}
              onClick={() => onSelectListing?.(other)}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none transition-colors duration-(--dur-fast) hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <ListingThumb listing={other}
                className="size-7"
                artClassName="max-h-6 max-w-6" />
              <span className={cn('min-w-0 flex-1 truncate text-xs font-semibold', nameColor(other))}>
                <span title={other.item.name}>{localizeMarketItemName(other.item)}</span>
              </span>
              <DealBadge deal={deals.get(other._id)}
                compact />
              <span className="max-w-24 shrink-0 truncate text-[11px] tabular-nums text-foreground/85">
                {priceText(other) || '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="卖家"
      className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <UserIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold">{seller.username ?? '未知卖家'}</span>
            {seller.inGameAccount && (
              <span className="truncate text-xs text-muted-foreground">*{seller.inGameAccount}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden
                className={cn('size-2 shrink-0 rounded-full', PRESENCE_TONE[seller.presence.kind])} />
              {seller.presenceText}
            </span>
            {seller.accountCreatedAt !== null && (
              <span title={new Date(seller.accountCreatedAt).toLocaleDateString()}>注册于 {seller.accountAgeText}</span>
            )}
          </div>
        </div>
      </div>

      {(others || onBrowseSeller) && (
        <div className="space-y-1">
          <h4 className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Store className="size-3" />
            <span className="flex-1">其他挂单{seller.othersTotal > 0 ? `（${seller.othersTotal}）` : ''}</span>
          </h4>
          {others}
          {onBrowseSeller && (
            <button
              type="button"
              onClick={onBrowseSeller}
              className="flex w-full items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors duration-(--dur-fast) hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              查看{seller.username ?? '该卖家'}的全部挂单
              <ChevronRight className="size-3" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
