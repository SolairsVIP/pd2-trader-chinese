import React, { useCallback, useEffect, useRef } from 'react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useClipboard } from '@/hooks/useClipboard';
import { useOptions } from '@/hooks/useOptions';
import { useKeySender } from '@/hooks/useKeySender';
import { useAppShortcuts } from '@/hooks/useShortcuts';
import { usePD2Auth } from '@/hooks/usePD2Auth';
import { useChangelog } from '@/hooks/useChangelog';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useSocketNotifications } from '@/hooks/useSocketNotifications';
import { useNetWorth } from '@/hooks/useNetWorth';
import { clipboardContainsValidItem, isStashItem, encodeItem, encodeItemForQuickList, sleep } from '@/lib/item-utils';
import {
  getBadgeCount,
  claimKeyboard,
  isKeyboardClaimed,
  releaseKeyboard,
  showToast,
  useOverlay,
  type PanelPayloads,
} from '@/overlay';
import { useDelist } from '@/pages/delist/DelistHandler';
import { useMarketAlerts } from '@/pages/market/alerts/useMarketAlerts';
import { readGameItemText } from '@/lib/browser-clipboard';
import { normalizeGameItemInput, type GameItemInput } from '@/lib/game-item-input';

/**
 * App-wide behaviour that is not a panel: global hotkeys, clipboard item capture, chat watcher, socket
 * notifications, auth/changelog, and always-on panels (chat button). Renders nothing.
 */
const AppController: React.FC = () => {
  const { copy } = useClipboard();
  const keyPress = useKeySender();
  const { settings, isLoading } = useOptions();
  const { openPanel, closePanel, togglePanel } = useOverlay();
  const { delistItem } = useDelist();
  const { takeSnapshot } = useNetWorth();

  // Socket notifications (offers and whispers) - exactly one instance, here
  useSocketNotifications({ settings, whisperNotificationsEnabled: true });

  // Saved-search alerts (15 s poll) - exactly one instance, here
  useMarketAlerts();

  // Launch toast (outside the game it shows in the screen corner, see ToastLayer)
  useEffect(() => {
    const timer = setTimeout(() => showToast('PD2 Trader 已在后台运行…'), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Hotkeys only act while Diablo is the foreground window
  const checkDiabloFocus = useCallback(async (): Promise<boolean> => {
    if (!isTauri()) return true;
    try {
      return await invoke<boolean>('is_diablo_focused');
    } catch (error) {
      console.warn('[AppController] Failed to check Diablo focus:', error);
      return true;
    }
  }, []);

  /** Ctrl+C the item under the cursor, restoring the user's clipboard afterwards. */
  const copyItemUnderCursor = useCallback(
    async (sendCopy: boolean): Promise<GameItemInput> => {
      // A panel holding the keyboard (e.g. an open price check) would get the Ctrl+C, and a Ctrl+C hotkey never
      // reached the game: hand focus back and let the game take the foreground before copying.
      const handedBack = isKeyboardClaimed();
      if (handedBack) {
        await releaseKeyboard({ focusGame: true });
        await sleep(50);
      }
      const savedClipboard = await readGameItemText();
      if (sendCopy || handedBack) await keyPress('ctrl+c');
      await sleep(250);
      const raw = await readGameItemText();
      try {
        if (savedClipboard != null) await copy(savedClipboard);
      } catch {
        /* clipboard restore is best-effort */
      }
      const result = normalizeGameItemInput(raw);
      if (result.error) showToast({ title: '中文物品识别', description: result.error, variant: 'error' });
      return result;
    },
    [copy, keyPress],
  );

  const fireSearch = useCallback(async (controller = false) => {
    if (!(await checkDiabloFocus())) return;
    // When the price-check hotkey itself is Ctrl+C the game already copied the item
    const capture = await copyItemUnderCursor(controller || !(settings.hotkeyModifier === 'ctrl' && settings.hotkeyKey === 'c'));
    if (capture.error) return;
    const raw = capture.text;
    if (!clipboardContainsValidItem(raw)) {
      showToast({ title: 'PD2 Trader', description: '物品不受支持或数据无效。', variant: 'error' });
      return;
    }
    openPanel('itemSearch', controller ? { text: encodeItem(raw), controller: true } : { text: encodeItem(raw) });
    if (controller) await claimKeyboard();
  }, [checkDiabloFocus, copyItemUnderCursor, openPanel, settings.hotkeyModifier, settings.hotkeyKey]);

  const openQuickList = useCallback(async () => {
    if (!(await checkDiabloFocus())) return;
    const capture = await copyItemUnderCursor(true);
    if (capture.error) return;
    const copied = capture.text;
    const raw = clipboardContainsValidItem(copied) ? copied : null;

    let payload: PanelPayloads['quickList'] = { error: 'not_shared_stash' };
    if (raw && isStashItem(raw)) payload = { item: encodeItemForQuickList(raw) };
    openPanel('quickList', payload, { placement: 'cursor' });

    // After opening so the toast shows above the panel
    if (!raw) {
      showToast({ title: '无法上架物品', description: '物品不受支持或数据无效。', variant: 'error' });
    } else if (!isStashItem(raw)) {
      showToast({
        title: '无法上架物品',
        description: '该物品不在共享仓库中，无法上架。',
        variant: 'error',
      });
    }
  }, [checkDiabloFocus, copyItemUnderCursor, openPanel]);

  const handleDelistItem = useCallback(async () => {
    if (!(await checkDiabloFocus())) return;
    const capture = await copyItemUnderCursor(true);
    if (capture.error) return;
    const copied = capture.text;
    if (!clipboardContainsValidItem(copied)) {
      showToast({ title: '下架物品', description: '光标下未找到有效物品。', variant: 'error' });
      return;
    }
    void delistItem(copied);
  }, [checkDiabloFocus, copyItemUnderCursor, delistItem]);

  // Registered global hotkeys call through this ref: re-renders (overlay, settings, net worth) never hand
  // useAppShortcuts new handlers, so it re-registers only when a hotkey setting changes (a press during an
  // unregister/register cycle would be lost).
  const hotkeyHandlers = {
    itemSearch: fireSearch,
    quickList: openQuickList,
    currency: async () => {
      if (await checkDiabloFocus()) openPanel('currency');
    },
    // Opening with unread messages lands on the newest unread thread (the badge leaves out muted ones)
    chat: () => (getBadgeCount('chatUnread') > 0 ? togglePanel('chat', { newestUnread: true }) : togglePanel('chat')),
    offers: () => openPanel('chat', { filter: 'selling' }),
    delist: handleDelistItem,
    snapshot: async () => {
      await takeSnapshot('manual');
    },
    // Closed: reopens on the search it was showing (keepMounted)
    market: () => togglePanel('market'),
  };
  const hotkeysRef = useRef(hotkeyHandlers);
  useEffect(() => {
    hotkeysRef.current = hotkeyHandlers;
  });
  const onItemSearch = useCallback(() => hotkeysRef.current.itemSearch(), []);
  const onQuickList = useCallback(() => hotkeysRef.current.quickList(), []);
  const onCurrency = useCallback(() => hotkeysRef.current.currency(), []);
  const onChat = useCallback(() => hotkeysRef.current.chat(), []);
  const onOffers = useCallback(() => hotkeysRef.current.offers(), []);
  const onDelist = useCallback(() => hotkeysRef.current.delist(), []);
  const onSnapshot = useCallback(() => hotkeysRef.current.snapshot(), []);
  const onMarket = useCallback(() => hotkeysRef.current.market(), []);
  useAppShortcuts(onItemSearch, onQuickList, onCurrency, onChat, onOffers, onDelist, onSnapshot, onMarket);

  useEffect(() => {
    if (!isTauri() || isLoading) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const enabled = settings.controllerPriceCheckEnabled === true;
    if (enabled) {
      listen('controller-price-check', () => { void hotkeysRef.current.itemSearch(true); }).then((stop) => {
        if (disposed) stop();
        else {
          unlisten = stop;
          void invoke('set_controller_price_check_enabled', { enabled: true }).catch(console.error);
        }
      }).catch(console.error);
    } else {
      void invoke('set_controller_price_check_enabled', { enabled: false }).catch(console.error);
    }
    return () => {
      disposed = true;
      unlisten?.();
      if (enabled) void invoke('set_controller_price_check_enabled', { enabled: false }).catch(console.error);
    };
  }, [isLoading, settings.controllerPriceCheckEnabled]);

  usePD2Auth();
  useAppUpdates();

  // Chat button overlay follows its setting (chat is a keepMounted panel: no warm-up needed)
  useEffect(() => {
    if (isLoading) return;
    if (settings.chatButtonOverlayEnabled === false) closePanel('chatButton');
    else openPanel('chatButton');
  }, [isLoading, settings.chatButtonOverlayEnabled, openPanel, closePanel]);

  // Chat watcher runs while whisper or trade notifications are enabled
  useEffect(() => {
    if (!isTauri() || isLoading) return;
    const shouldWatch = (settings.whisperNotificationsEnabled ?? true) || (settings.tradeNotificationsEnabled ?? true);
    const command = shouldWatch
      ? invoke('start_chat_watcher', { customD2Dir: settings.diablo2Directory })
      : invoke('stop_chat_watcher');
    command.catch((error) => console.error('Failed to manage chat watcher:', error));
    return () => {
      invoke('stop_chat_watcher').catch(console.error);
    };
  }, [settings.whisperNotificationsEnabled, settings.tradeNotificationsEnabled, settings.diablo2Directory, isLoading]);

  return <WhatsNewOnUpgrade />;
};

/** Its own component: What's New watches the sign-in panel, which re-renders on every overlay state change. */
function WhatsNewOnUpgrade() {
  useChangelog();
  return null;
}

export default AppController;
