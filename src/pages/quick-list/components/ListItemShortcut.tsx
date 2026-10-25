import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { localizeItemName } from '@/lib/localize-item-name';
import { GameItemMatchingError } from '@/lib/game-stash-input';
import { describeUiError } from '@/lib/ui-error';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  X,
  GripVertical,
  Loader2,
  AlertCircle,
  Clock,
  Hourglass,
  ListChecks,
  PackageSearch,
  SearchX,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Item as PriceCheckItem } from '@/pages/price-check/lib/interfaces';
import { Item as GameStashItem } from '@/common/types/pd2-website/GameStashResponse';
import { buildGetMarketListingByStashItemQuery } from '@/pages/price-check/lib/tradeUrlBuilder';
import { isStashItem } from '@/lib/item-utils';
import { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import { usePd2Website, AccountMismatchError, AuthenticationError } from '@/hooks/pd2website/usePD2Website';
import { useOptions } from '@/hooks/useOptions';
import { CustomToastPayload, ToastActionType, GenericToastPayload } from '@/common/types/Events';
import { shortcutFormSchema, ShortcutFormData } from './types';
import ItemSelectionList from './ItemSelectionList';
import ListingFormFields from './ListingFormFields';
import LoadingAndErrorStates from './LoadingAndErrorStates';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ListedItemsTab from './ListedItemsTab';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buildGetAllUserMarketListingsQuery } from '@/pages/price-check/lib/tradeUrlBuilder';
import { trackEvent, trackMeasurement } from '@/lib/telemetry';
import { usePendingListingsQueue, PendingListing } from '@/hooks/usePendingListingsQueue';
import MultipleMatchSelector from './MultipleMatchSelector';
import EmptyState from './EmptyState';
import { countChip, itemCard } from './styles';
import { WindowPanel } from '@/components/custom/window-chrome';
import { cn } from '@/lib/utils';
import { DUR, EASE_OUT, fadeInUp, listItem, listStagger, popIn } from '@/lib/motion';
import { showToast, usePanel } from '@/overlay';

interface ListItemShortcutFormProps {
  item: PriceCheckItem | null;
}

const ListItemShortcutForm: React.FC<ListItemShortcutFormProps> = ({ item }) => {
  const {
    findMatchingItems,
    listSpecificItem,
    authData,
    getMarketListings,
    updateMarketListing,
    updateItemByHash,
    deleteMarketListing,
  } = usePd2Website();
  const { settings } = useOptions();
  const {
    addPendingListing,
    removePendingListing,
    updateLastPolled,
    getPendingListing,
    pendingListings,
    POLL_INTERVAL,
  } = usePendingListingsQueue();
  const pendingListingsRef = useRef(pendingListings);
  pendingListingsRef.current = pendingListings;
  const [matchingItems, setMatchingItems] = useState<GameStashItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GameStashItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAccountMismatch, setIsAccountMismatch] = useState(false);
  const [currentListings, setCurrentListings] = useState<MarketListingEntry[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isMarketListingsLoading, setIsMarketListingsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [totalListingsCount, setTotalListingsCount] = useState<number>(0);
  const [allListings, setAllListings] = useState<MarketListingEntry[]>([]);
  const [isQueued, setIsQueued] = useState(false);
  const [queuedListingIds, setQueuedListingIds] = useState<Set<string>>(new Set());
  const [isPolling, setIsPolling] = useState(false);
  const [queueErrors, setQueueErrors] = useState<Record<string, string>>({});
  const [queueCandidates, setQueueCandidates] = useState<Record<string, GameStashItem[]>>({});
  const [showQueueOption, setShowQueueOption] = useState(false); // Track if user explicitly revealed queue option
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollRunningRef = useRef(false); // Prevent overlapping poll cycles
  const isProcessingRef = useRef<Set<string>>(new Set()); // Track which items are being processed

  const form = useForm<ShortcutFormData>({
    resolver: zodResolver(shortcutFormSchema),
    defaultValues: { type: 'exact', note: '', price: '', currency: 'HR' },
  });

  const { close: handleClose } = usePanel<'quickList'>();

  // Complete reset function for new items
  // Note: Does not clear queuedListingIds - queued items should persist across item selections
  const resetAllState = useCallback(() => {
    setMatchingItems([]);
    setSelectedItem(null);
    setError(null);
    setIsAccountMismatch(false);
    setCurrentListings([]);
    setExpandedItems(new Set());
    setIsMarketListingsLoading(false);
    setSubmitLoading(false);
    setShowQueueOption(false);
    isProcessingRef.current = new Set();
    form.reset({ type: 'exact', note: '', price: '', currency: 'HR' });
  }, [form]);

  const findMatchingItemsInStash = useCallback(async () => {
    // Reset everything first when starting a new search
    resetAllState();

    setIsLoading(true);
    setError(null);
    const startTime = performance.now();
    try {
      const items = await findMatchingItems(item);
      const duration = performance.now() - startTime;

      trackMeasurement(
        'list_item_matching_search',
        { duration_ms: duration, matched_items: items.length },
        { outcome: 'success' },
      );

      setMatchingItems(items);
      if (items.length === 1) {
        setSelectedItem(items[0]);
        setShowQueueOption(false); // Reset queue option visibility
        trackEvent('list_item_auto_selected');
      } else {
        setSelectedItem(null);
        setShowQueueOption(false); // Reset queue option visibility when new search
      }
    } catch (err) {
      const duration = performance.now() - startTime;
      trackMeasurement('list_item_matching_search', { duration_ms: duration }, { outcome: 'error' });
      // AccountMismatchError / AuthenticationError are expected user-state conditions, not app bugs
      if (!(err instanceof AccountMismatchError) && !(err instanceof AuthenticationError)) {
        console.error(err instanceof Error ? err.message : 'Failed to find items');
      }

      // Handle account mismatch error with user-friendly message
      if (err instanceof AccountMismatchError) {
        const errorMessage = describeUiError(err);
        setError(errorMessage);
        setIsAccountMismatch(true);

        const toastPayload: GenericToastPayload = {
          title: '账号不匹配',
          description: errorMessage,
          variant: 'error',
          duration: 8000,
        };
        showToast(toastPayload);
      } else {
        setError(describeUiError(err, '查找仓库物品失败，请稍后重试。'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [findMatchingItems, item, resetAllState]);

  // Sync queued items from storage on mount and when pendingListings changes
  // This ensures queued items persist even when selecting different items
  useEffect(() => {
    if (authData) {
      // Load all pending listings from storage
      const allPendingIds = new Set(pendingListings.map((p) => p.id));
      setQueuedListingIds(allPendingIds);
      setIsQueued(allPendingIds.size > 0);
    }
  }, [authData, pendingListings]);

  // Find matching items when component mounts or item changes
  useEffect(() => {
    if (item && authData) {
      // Check if this item is already queued
      const existingQueued = pendingListings.find((p) => JSON.stringify(p.item) === JSON.stringify(item));
      if (existingQueued) {
        // Switch to queued tab if item is already queued
        setActiveTab('queued');
      } else {
        // Always search for matching items - queued items are handled separately
        findMatchingItemsInStash();
      }
    } else if (!item) {
      // If item is cleared/null, reset state (but keep queued items)
      resetAllState();
    }
    // Only depend on item and authData to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, authData]);

  const pd2MarketQuery = useMemo(() => {
    if (!item || !authData || matchingItems.length === 0) return null;
    return buildGetMarketListingByStashItemQuery(matchingItems, authData.user._id);
  }, [matchingItems, authData, item]);

  const getMarketListingsForStashItems = useCallback(async () => {
    if (!pd2MarketQuery) return;

    setIsMarketListingsLoading(true);
    try {
      const result = await getMarketListings(pd2MarketQuery);
      if (result.data.length > 0) {
        setCurrentListings(result.data.map((item) => item));
      } else {
        setCurrentListings([]);
      }
    } catch (err) {
      console.error('Failed to fetch market listings:', err);
      setCurrentListings([]);
    } finally {
      setIsMarketListingsLoading(false);
    }
  }, [pd2MarketQuery, getMarketListings]);

  // Fetch market listings when pd2MarketQuery changes (after matching items are found)
  useEffect(() => {
    if (pd2MarketQuery) {
      getMarketListingsForStashItems();
    }
  }, [pd2MarketQuery, getMarketListingsForStashItems]);

  // Fetch all user listings for the badge and to pass to ListedItemsTab
  const allListingsQuery = useMemo(() => {
    if (!authData || !settings) return null;
    return buildGetAllUserMarketListingsQuery(
      authData.user._id,
      settings.mode === 'hardcore',
      settings.ladder === 'ladder',
      5, // Fetch first page (5 items to match ITEMS_PER_PAGE) to get both data and total count
      0,
    );
  }, [authData, settings]);

  const fetchAllListings = useCallback(async () => {
    if (!allListingsQuery) return;
    try {
      const result = await getMarketListings(allListingsQuery);
      setAllListings(result.data);
      setTotalListingsCount(result.total);
    } catch (err) {
      console.error('Failed to fetch all listings:', err);
      setAllListings([]);
      setTotalListingsCount(0);
    }
  }, [allListingsQuery, getMarketListings]);

  useEffect(() => {
    fetchAllListings();
  }, [fetchAllListings]);

  // Process a queued listing once item is found
  const processQueuedListing = useCallback(
    async (pendingListing: PendingListing | undefined, stashItem: GameStashItem) => {
      if (!pendingListing) {
        return;
      }
      if (!stashItem) {
        return;
      }

      const values = pendingListing.formData;

      const priceValue =
        values.price === null || values.price === undefined || values.price === ''
          ? null
          : typeof values.price === 'string'
            ? values.price.trim()
            : values.price;
      const numericPrice = priceValue !== null ? Number(priceValue) : null;
      const hasPrice = numericPrice !== null && !isNaN(numericPrice) && numericPrice > 0;
      const listingType = hasPrice ? 'exact' : 'note';
      const startTime = performance.now();
      try {
        // Refresh listings count before checking to get the most up-to-date count
        if (allListingsQuery) {
          const listingsResult = await getMarketListings(allListingsQuery);
          const currentTotalCount = listingsResult.total;

          // Check if user has reached the maximum number of listings (50)
          if (currentTotalCount >= 50) {
            const warningToast: GenericToastPayload = {
              title: '挂单数量已达上限',
              description:
                '最多可保留 50 个有效挂单，请先下架现有物品后再上架。',
              variant: 'error',
            };
            showToast(warningToast);
            return;
          }
        }

        const listing = await listSpecificItem(
          stashItem,
          hasPrice && numericPrice !== null ? numericPrice : 0,
          values.note || '',
          listingType,
        );

        await fetchAllListings();

        trackMeasurement(
          'list_item_create',
          { duration_ms: performance.now() - startTime, price_hr: hasPrice ? numericPrice : undefined },
          { outcome: 'success', listing_type: listingType, source: 'queued' },
        );

        // Emit custom toast with listing data
        const toastPayload: CustomToastPayload = {
          title: '物品已上架！',
          description: `排队物品已成功上架到 PD2 交易市场。`,
          action: {
            label: '查看挂单',
            type: ToastActionType.OPEN_MARKET_LISTING,
            data: {
              listingId: listing._id,
            },
          },
        };

        showToast(toastPayload);
      } catch (err) {
        console.error('[Queue] Failed to process queued listing:', err);
        trackMeasurement(
          'list_item_create',
          { duration_ms: performance.now() - startTime },
          { outcome: 'error', source: 'queued' },
        );
        const errorToast: GenericToastPayload = {
          title: '物品上架失败',
          description: describeUiError(err, '排队物品上架失败，请稍后重试。'),
          variant: 'error',
        };
        showToast(errorToast);
      }
    },
    [listSpecificItem, fetchAllListings, allListingsQuery, getMarketListings, totalListingsCount],
  );

  const completeQueuedListing = useCallback(async (pending: PendingListing, stashItem: GameStashItem) => {
    if (isProcessingRef.current.has(pending.id) || !pendingListingsRef.current.some((p) => p.id === pending.id)) return;
    isProcessingRef.current.add(pending.id);
    setQueuedListingIds((prev) => {
      const next = new Set(prev);
      next.delete(pending.id);
      return next;
    });
    removePendingListing(pending.id);
    try {
      await processQueuedListing(pending, stashItem);
    } finally {
      isProcessingRef.current.delete(pending.id);
    }
  }, [processQueuedListing, removePendingListing]);

  // Poll for all queued items
  const pollForAllQueuedItems = useCallback(async () => {
    if (!authData) {
      return;
    }

    // Prevent overlapping poll cycles
    if (isPollRunningRef.current) {
      return;
    }

    const currentQueuedIds = Array.from(queuedListingIds);
    if (currentQueuedIds.length === 0) {
      setIsPolling(false);
      setIsQueued(false);
      return;
    }

    isPollRunningRef.current = true;
    setIsPolling(true);

    // Process each queued item independently
    const pollPromises = currentQueuedIds.map(async (pendingId) => {
      // Skip if already processing this item
      if (isProcessingRef.current.has(pendingId)) {
        return;
      }

      const pendingListing = getPendingListing(pendingId);
      if (!pendingListing) {
        setQueuedListingIds((prev) => {
          const next = new Set(prev);
          next.delete(pendingId);
          return next;
        });
        return;
      }

      // Check for timeout (MAX_POLL_ATTEMPTS * POLL_INTERVAL)
      const now = Date.now();
      const age = now - pendingListing.createdAt;
      const maxAge = 60 * POLL_INTERVAL; // MAX_POLL_ATTEMPTS * POLL_INTERVAL
      if (age >= maxAge) {
        // Remove from queue
        removePendingListing(pendingId);
        setQueuedListingIds((prev) => {
          const next = new Set(prev);
          next.delete(pendingId);
          return next;
        });

        // Show error toast
        const timeoutToast: GenericToastPayload = {
          title: '上架等待超时',
          description: `“${pendingListing.item.name || pendingListing.item.type}”在等待期限内未完成匹配或上架。请检查账号、分区和共享仓库后重新尝试。`,
          variant: 'error',
        };
        showToast(timeoutToast);
        return;
      }

      updateLastPolled(pendingId);

      try {
        const items = await findMatchingItems(pendingListing.item, { forceRefresh: true });
        if (isProcessingRef.current.has(pendingId)) return;
        const eligible = items.filter((candidate) => !pendingListing.initialMatchingHashes?.has(candidate.hash));
        setQueueErrors((prev) => ({ ...prev, [pendingId]: '' }));
        setQueueCandidates((prev) => ({ ...prev, [pendingId]: eligible.length > 1 ? eligible : [] }));
        if (eligible.length === 1) await completeQueuedListing(pendingListing, eligible[0]);
      } catch (err) {
        console.error('[Queue] Error polling for queued item:', pendingId, err);
        isProcessingRef.current.delete(pendingId);
        setQueueCandidates((prev) => ({ ...prev, [pendingId]: [] }));
        setQueueErrors((prev) => ({
          ...prev,
          [pendingId]: err instanceof AuthenticationError
            ? '登录已失效，请重新登录后重试。'
            : err instanceof GameItemMatchingError
              ? err.message
              : '检查仓库失败，将在下一轮重试。请检查网络连接和登录状态。',
        }));

        // Handle account mismatch error with user-friendly message
        if (err instanceof AccountMismatchError) {
          // Remove from queue since we can't process it
          removePendingListing(pendingId);
          setQueuedListingIds((prev) => {
            const next = new Set(prev);
            next.delete(pendingId);
            return next;
          });

          const toastPayload: GenericToastPayload = {
            title: '账号不匹配',
            description: describeUiError(err),
            variant: 'error',
            duration: 8000,
          };
          showToast(toastPayload);
        }
      }
    });

    await Promise.all(pollPromises);
    isPollRunningRef.current = false;

    // Update isQueued state based on remaining queued items
    setQueuedListingIds((prev) => {
      const remaining = Array.from(prev);
      setIsQueued(remaining.length > 0);
      setIsPolling(remaining.length > 0);
      return prev;
    });
  }, [
    authData,
    findMatchingItems,
    getPendingListing,
    updateLastPolled,
    removePendingListing,
    queuedListingIds,
    completeQueuedListing,
    POLL_INTERVAL,
  ]);

  const pollCallbackRef = useRef(pollForAllQueuedItems);
  pollCallbackRef.current = pollForAllQueuedItems;

  // Start polling for all queued items
  useEffect(() => {
    const hasQueuedItems = queuedListingIds.size > 0;

    // Set up polling if we have queued items and no interval is running
    if (hasQueuedItems && !pollIntervalRef.current) {
      // Poll immediately first
      pollCallbackRef.current();

      // Then set up interval
      pollIntervalRef.current = setInterval(() => {
        pollCallbackRef.current();
      }, POLL_INTERVAL);
    } else if (!hasQueuedItems && pollIntervalRef.current) {
      // Stop polling if no queued items
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      setIsPolling(false);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedListingIds.size]);

  const handleSubmit = async (values: ShortcutFormData) => {
    // If no item selected and we have an item, allow queuing
    // This includes both: no items found (length === 0) and multiple items found but none selected
    if (!selectedItem && item) {
      setSubmitLoading(true);
      // Check listing count before queuing
      await fetchAllListings();
      if (totalListingsCount >= 50) {
        const warningToast: GenericToastPayload = {
          title: '挂单数量已达上限',
          description:
            '最多可保留 50 个有效挂单，请先下架现有物品后再上架。',
          variant: 'error',
        };
        showToast(warningToast);
        setSubmitLoading(false);
        return;
      }

      // Store initial matching hashes if there are multiple matches
      const initialMatchingHashes =
        matchingItems.length > 0 ? new Set(matchingItems.map((item) => item.hash)) : undefined;

      const pendingId = addPendingListing(item, values, initialMatchingHashes);

      setQueuedListingIds((prev) => new Set([...prev, pendingId]));
      setIsQueued(true);
      setSubmitLoading(false);

      trackEvent('list_item_queued', { has_multiple_matches: matchingItems.length > 0 });
      const queuedToast: GenericToastPayload = {
        title: '物品已加入队列',
        description:
          matchingItems.length > 0
            ? "正在等待官网仓库出现新物品。入队时的候选已排除；出现多个新候选时需要手动选择。"
            : "正在检查官网共享仓库。找到单件候选后自动上架；多个候选需要手动选择。",
        variant: 'default',
      };
      showToast(queuedToast);

      // Switch to queued tab to show the queued item
      setActiveTab('queued');

      // Reset form to allow queuing another item, but keep showQueueOption true
      form.reset({ type: 'exact', note: '', price: '', currency: 'HR' });
      // Don't hide window - allow user to queue multiple items
      return;
    }

    if (!selectedItem) {
      setError('请先选择要上架的物品。');
      trackEvent('list_item_submit_rejected', { reason: 'no_item_selected' });
      return;
    }
    setSubmitLoading(true);
    const startTime = performance.now();
    try {
      // Determine type based on which fields are filled
      // Normalize price: handle empty strings, whitespace, undefined, null
      const priceValue =
        values.price === null || values.price === undefined || values.price === ''
          ? null
          : typeof values.price === 'string'
            ? values.price.trim()
            : values.price;
      const numericPrice = priceValue !== null ? Number(priceValue) : null;
      const hasPrice = numericPrice !== null && !isNaN(numericPrice) && numericPrice > 0;
      const listingType = hasPrice ? 'exact' : 'note';

      const isAlreadyListed = !!currentListingForSelected;
      if (isAlreadyListed) {
        // Prepare update fields
        const updateFields: Record<string, any> = {};
        if (listingType === 'note') {
          updateFields.price = values.note || '';
          updateFields.hr_price = 0;
        } else if (listingType === 'exact') {
          updateFields.hr_price = numericPrice;
          updateFields.price = values.note || '';
        }
        await updateMarketListing(currentListingForSelected._id, updateFields);
        await updateItemByHash(selectedItem.hash, updateFields);
        await fetchAllListings(); // Refresh all listings
        showToast({ title: 'PD2 Trader', description: '挂单已更新！' });

        trackMeasurement(
          'list_item_update',
          { duration_ms: performance.now() - startTime, price_hr: hasPrice ? numericPrice : undefined },
          { outcome: 'success', listing_type: listingType },
        );

        handleClose();
      } else {
        // Check if user has reached the maximum number of listings (50)
        if (totalListingsCount >= 50) {
          const warningToast: GenericToastPayload = {
            title: '挂单数量已达上限',
            description:
              '最多可保留 50 个有效挂单，请先下架现有物品后再上架。',
            variant: 'error',
          };
          showToast(warningToast);
          setSubmitLoading(false);
          return;
        }
        const listing = await listSpecificItem(
          selectedItem,
          hasPrice && numericPrice !== null ? numericPrice : 0,
          values.note || '',
          listingType,
        );
        form.reset({ type: 'exact', note: '', price: '', currency: 'HR' });

        trackMeasurement(
          'list_item_create',
          { duration_ms: performance.now() - startTime, price_hr: hasPrice ? numericPrice : undefined },
          { outcome: 'success', listing_type: listingType, source: 'direct' },
        );

        // Emit custom toast with listing data
        const toastPayload: CustomToastPayload = {
          title: '物品已上架！',
          description: `已添加到 PD2 交易市场。`,
          action: {
            label: '查看挂单',
            type: ToastActionType.OPEN_MARKET_LISTING,
            data: {
              listingId: listing._id,
            },
          },
        };

        showToast(toastPayload);
        await fetchAllListings(); // Refresh all listings
        handleClose();
      }
    } catch (err) {
      const isAlreadyListed = !!currentListingForSelected;
      trackMeasurement(
        isAlreadyListed ? 'list_item_update' : 'list_item_create',
        { duration_ms: performance.now() - startTime },
        { outcome: 'error', source: isAlreadyListed ? undefined : 'direct' },
      );
      console.error(err instanceof Error ? err.message : 'Failed to list/update item');
      setError(describeUiError(err, '上架或更新挂单失败，请稍后重试。'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const toggleExpandedStats = (itemHash: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemHash)) {
      newExpanded.delete(itemHash);
    } else {
      newExpanded.add(itemHash);
    }
    setExpandedItems(newExpanded);
  };

  const expandAllStats = () => {
    const allHashes = matchingItems.map((item) => item.hash).filter(Boolean);
    setExpandedItems(new Set(allHashes));
  };

  const collapseAllStats = () => {
    setExpandedItems(new Set());
  };

  const handleBump = async (marketId: string, itemHash: string) => {
    const startTime = performance.now();
    try {
      await updateMarketListing(marketId, { bumped_at: new Date().toISOString() });
      await updateItemByHash(itemHash, { bumped_at: new Date().toISOString() });
      const duration = performance.now() - startTime;
      trackMeasurement(
        'list_item_bump',
        { duration_ms: duration },
        { outcome: 'success', source: 'list_item_shortcut' },
      );
    } catch (err) {
      const duration = performance.now() - startTime;
      trackMeasurement('list_item_bump', { duration_ms: duration }, { outcome: 'error', source: 'list_item_shortcut' });
      throw err;
    }
  };

  const handleRefresh = async () => {
    trackEvent('list_item_refresh');
    await getMarketListingsForStashItems();
    await findMatchingItemsInStash();
  };

  // Find the current market listing for the selected item
  const currentListingForSelected = useMemo(
    () => (selectedItem ? currentListings.find((c) => c.item.hash === selectedItem.hash) : undefined),
    [selectedItem, currentListings],
  );

  // Prepopulate form fields when selecting a listed item
  useEffect(() => {
    if (!selectedItem || !item) return;

    const resetValues: ShortcutFormData = currentListingForSelected
      ? {
          type:
            typeof currentListingForSelected.hr_price === 'number' && currentListingForSelected.hr_price > 0
              ? 'exact'
              : 'note',
          note: typeof currentListingForSelected.price === 'string' ? currentListingForSelected.price : '',
          price: currentListingForSelected.hr_price ?? '',
          currency: 'HR',
        }
      : { type: 'exact', note: '', price: '', currency: 'HR' };

    form.reset(resetValues);
  }, [selectedItem, currentListingForSelected, form, item]);

  // State for active tab
  const [activeTab, setActiveTab] = useState(item && isStashItem(item) ? 'list-item' : 'listed-items');

  // Auto-switch to list-item tab when a new valid stash item is detected
  // Otherwise default to Manage tab
  useEffect(() => {
    if (item && isStashItem(item)) {
      setActiveTab('list-item');
    } else {
      setActiveTab('listed-items');
    }
  }, [item, resetAllState]);

  // Render queued items view
  const renderQueuedItemsContent = () => {
    const queuedItems = Array.from(queuedListingIds)
      .map((id) => getPendingListing(id))
      .filter((p): p is PendingListing => p !== undefined);

    if (queuedItems.length === 0) {
      return (
        <EmptyState icon={<ListChecks />}
          title="暂无排队物品"
          className="h-full">
          等待上架的物品会显示在这里。
        </EmptyState>
      );
    }

    return (
      <div className="flex flex-col gap-4 w-full h-full min-h-0">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-2 text-center flex-shrink-0 pt-2"
        >
          <span className="relative flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25">
            <Hourglass className="size-5" />
            <Loader2
              className="absolute inset-0 size-12 animate-spin text-primary/50 [animation-duration:2.4s]"
              strokeWidth={1}
            />
          </span>
          <div className="text-base font-semibold tracking-tight">等待上架的物品</div>
          <div className="text-sm text-muted-foreground max-w-md leading-relaxed">
            每 15 秒检查一次官网仓库。找到单件候选后自动上架；多个候选需手动选择。
          </div>
          <AnimatePresence>
            {isPolling && (
              <motion.div
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground"
                role="status"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>正在检查仓库…</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <ScrollArea className="flex-1 min-h-0">
          <motion.div
            className="flex flex-col gap-2 p-px pb-2 pr-2"
            variants={listStagger}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence initial={false}>
              {queuedItems.map((pendingListing) => {
                const itemName = pendingListing.item.name || pendingListing.item.type;
                const age = Date.now() - pendingListing.createdAt;
                const maxAge = 60 * POLL_INTERVAL;
                const timeRemaining = Math.max(0, maxAge - age);
                const minutesRemaining = Math.ceil(timeRemaining / 60000);
                const elapsedPct = Math.min(100, Math.max(0, (age / maxAge) * 100));
                const { note, price } = pendingListing.formData;

                return (
                  <motion.div
                    layout
                    variants={listItem}
                    exit={{ opacity: 0, x: -12, transition: { duration: DUR.fast } }}
                    key={pendingListing.id}
                    className={itemCard({ className: 'flex flex-wrap items-center justify-between gap-3' })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium" title={itemName}>{localizeItemName(pendingListing.item.isRuneword ? pendingListing.item.runeword ?? itemName : itemName, pendingListing.item.isRuneword ? 'Runeword' : pendingListing.item.quality)}</div>
                      {(note || price) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {price && (
                            <span className="rounded-full bg-primary/12 px-1.5 py-px font-semibold tabular-nums text-primary">
                              {`价格：${price} HR`}
                            </span>
                          )}
                          {note && <span className="truncate">{`备注：${note}`}</span>}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3 shrink-0" />
                        <span className="shrink-0">自动等待期限：还剩约 {minutesRemaining} 分钟</span>
                        <div
                          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label="排队超时进度"
                          aria-valuenow={Math.round(elapsedPct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full bg-primary/70 transition-[width] duration-(--dur-slow) ease-out"
                            style={{ width: `${elapsedPct}%` }}
                          />
                        </div>
                      </div>
                      {queueErrors[pendingListing.id] ? (
                        <p role="alert" className="mt-2 text-sm text-destructive">{queueErrors[pendingListing.id]}</p>
                      ) : pendingListing.initialMatchingHashes?.size ? (
                        <p className="mt-2 text-xs text-muted-foreground">已排除入队时的候选，正在等待新物品；若目标已在其中，请取消排队后重新选择。</p>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        removePendingListing(pendingListing.id);
                        setQueuedListingIds((prev) => {
                          const next = new Set(prev);
                          next.delete(pendingListing.id);
                          if (next.size === 0) {
                            setIsQueued(false);
                            if (pollIntervalRef.current) {
                              clearInterval(pollIntervalRef.current);
                              pollIntervalRef.current = null;
                            }
                            if (item) {
                              findMatchingItemsInStash();
                            }
                          }
                          return next;
                        });
                      }}
                    >
                      <X className="size-3.5" />
                      取消
                    </Button>
                    {queueCandidates[pendingListing.id]?.length > 1 && (
                      <div className="w-full">
                        <MultipleMatchSelector
                          matchingItems={queueCandidates[pendingListing.id]}
                          expandedItems={expandedItems}
                          onItemSelect={(candidate) => completeQueuedListing(pendingListing, candidate)}
                          onToggleExpanded={toggleExpandedStats}
                          onExpandAll={expandAllStats}
                          onCollapseAll={collapseAllStats}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </ScrollArea>
      </div>
    );
  };

  // Logic to determine what to render inside the "List Item" tab
  const renderListItemContent = () => {
    if (!item) {
      return (
        <EmptyState icon={<PackageSearch />}
          title="未选择物品"
          className="h-[300px]">
          在游戏中复制物品（Ctrl+C）后重新打开此窗口即可上架；也可以选择“管理挂单”查看当前交易。
        </EmptyState>
      );
    }

    // 1. Loading or Error
    if (isLoading || error) {
      return (
        <LoadingAndErrorStates
          isLoading={isLoading}
          error={error}
          matchingItems={matchingItems}
          onRetry={findMatchingItemsInStash}
          isAccountMismatch={isAccountMismatch}
        />
      );
    }

    // 4. No Items Found (with Queue option)
    if (matchingItems.length === 0 && !isLoading && !error && item) {
      return (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center justify-center py-6 gap-4"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-warning/12 text-warning ring-1 ring-warning/25">
            <SearchX className="size-6" />
          </span>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span>仓库中没有找到匹配“{item.name || item.type}”的物品</span>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="为什么没有找到该物品？"
                    className="inline-flex rounded-full text-warning outline-none transition-transform duration-(--dur-fast) hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <AlertCircle className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs text-center">
                  物品必须放在共享仓库（而非个人仓库）中，并且重新创建游戏后才能被搜索到。
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-sm text-muted-foreground max-w-md leading-relaxed">
              可以将此物品加入上架队列。服务器会从仓库同步物品（通常需要几分钟），同步完成后自动上架。
            </div>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}
              className="w-full max-w-lg">
              <ListingFormFields
                form={form}
                selectedItem={null}
                currentListings={[]}
                submitLoading={submitLoading}
                onSubmit={handleSubmit}
                allowQueue={true}
              />
            </form>
          </Form>
        </motion.div>
      );
    }

    // 5. Default: Item Selection Form
    if (item) {
      const queueMode = matchingItems.length > 0 && !selectedItem && showQueueOption;
      return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}
            className="h-full flex flex-col overflow-hidden">
            <ItemSelectionList
              deleteMarketListing={deleteMarketListing}
              matchingItems={matchingItems}
              selectedItem={selectedItem}
              currentListings={currentListings}
              expandedItems={expandedItems}
              isMarketListingsLoading={isMarketListingsLoading}
              onItemSelect={(item) => {
                setSelectedItem(item);
                setShowQueueOption(false);
              }}
              onToggleExpanded={toggleExpandedStats}
              onExpandAll={expandAllStats}
              onCollapseAll={collapseAllStats}
              onBump={handleBump}
              onRefresh={handleRefresh}
            />

            <div className="flex-shrink-0 space-y-2">
              <AnimatePresence initial={false}
                mode="popLayout">
                {!showQueueOption && (
                  <motion.div
                    key="queue-cta"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: DUR.fast, ease: EASE_OUT }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 py-1.5 pl-3 pr-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">这些物品都不匹配？</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedItem(null);
                        setShowQueueOption(true);
                      }}
                      className="text-xs h-7 px-3"
                    >
                      加入上架队列
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              {(selectedItem || queueMode) && (
                <motion.div layout="position"
                  className="space-y-2">
                  {queueMode && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-primary/8 px-2 py-1.5 text-xs text-muted-foreground"
                    >
                      <Hourglass className="size-3.5 shrink-0 text-primary" />
                      将此物品加入队列，等待它同步到仓库中（通常需要几分钟）。
                    </motion.div>
                  )}
                  <ListingFormFields
                    form={form}
                    selectedItem={selectedItem}
                    currentListings={currentListings}
                    submitLoading={submitLoading}
                    onSubmit={handleSubmit}
                    allowQueue={queueMode}
                  />
                </motion.div>
              )}
            </div>
          </form>
        </Form>
      );
    }

    // 6. Fallback (No item provided manually)
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <p className="text-center">
          尚未选择物品。请使用快捷键，或通过物品参数打开窗口以上架物品。
        </p>
      </div>
    );
  };

  const tabLabel = (label: string, count: number) => (
    <>
      <span className="font-bold"
        style={{ fontFamily: 'DiabloFont' }}>
        {label}
      </span>
      <AnimatePresence initial={false}>
        {count > 0 && (
          <motion.span
            key={count}
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(countChip, 'h-[18px] min-w-[18px] text-[11px]')}
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <WindowPanel animate
        className="h-full w-full">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full flex-1 flex flex-col h-full gap-0 overflow-hidden"
        >
          <div
            className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-2.5"
            id="titlebar"
            data-panel-drag
          >
            <div className="flex items-center gap-1.5">
              <GripVertical
                data-panel-drag
                className="h-4 w-4 cursor-grab active:cursor-grabbing text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground"
                id="titlebar-drag-handle"
              />
              <TabsList className="h-8">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={-1}>
                        <TabsTrigger
                          value="list-item"
                          className="font-bold px-2.5"
                          style={{ fontFamily: 'DiabloFont' }}
                          disabled={item ? !isStashItem(item) : false}
                        >
                          上架物品
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>
                    {item && !isStashItem(item) && (
                      <TooltipContent>
                        <p>物品必须位于共享仓库中才能上架。</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <TabsTrigger value="listed-items"
                  className="font-bold px-2.5">
                  {tabLabel('管理挂单', totalListingsCount)}
                </TabsTrigger>
                <TabsTrigger value="queued"
                  className="font-bold px-2.5">
                  {tabLabel('排队中', queuedListingIds.size)}
                </TabsTrigger>
              </TabsList>
            </div>

            <Button
              type="button"
              id="titlebar-close"
              aria-label="关闭"
              size="icon"
              className="size-7 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              variant="ghost"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <TabsContent value="list-item"
            className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-4">
            {renderListItemContent()}
          </TabsContent>

          <TabsContent value="listed-items"
            className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-4">
            <ListedItemsTab
              onClose={handleClose}
              initialListings={allListings}
              initialTotalCount={totalListingsCount}
              onTotalCountChange={setTotalListingsCount}
              onListingsChange={setAllListings}
            />
          </TabsContent>

          <TabsContent value="queued"
            className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-4">
            {renderQueuedItemsContent()}
          </TabsContent>
        </Tabs>
      </WindowPanel>
    </MotionConfig>
  );
};

export default ListItemShortcutForm;
