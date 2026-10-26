import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  ChevronUp,
  Coins,
  List,
  MapPin,
  type LucideIcon,
  MessageSquare,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { popIn, scaleIn } from '@/lib/motion';
import corruptionShard from '@/assets/corruption-luck/shard.png';

interface ChatButtonProps {
  /** Tab size (CSS px); everything inside scales with its width. */
  size: { width: number; height: number };
  onChatClick: () => void;
  onOffersClick: () => void;
  onMarketClick?: () => void;
  onNetWorthClick?: () => void;
  onStashValueClick?: () => void;
  onManageListingsClick?: () => void;
  onSettingsClick?: () => void;
  onCorruptedZoneClick?: () => void;
  onCorruptionLuckClick?: () => void;
  onDisableClick?: () => void;
  unreadCount?: number;
  tradeOffersCount?: number;
  /** Called while the tab is dragged with the vertical travel (px) since the press. Omitted: not draggable. */
  onDrag?: (dy: number) => void;
  onDragEnd?: () => void;
  /** Open the menu below the tab instead of above it (the tab is near the top). */
  menuBelow?: boolean;
}

/** Moving the pointer from the tab to the menu crosses a small gap: only close after this long outside both. */
const LEAVE_GRACE_MS = 400;

const formatCount = (count: number) => (count > 99 ? '99+' : String(count));

const CountBadge: React.FC<{ count: number; className: string; label: string; style?: React.CSSProperties }> = ({
  count,
  className,
  label,
  style,
}) => (
  <motion.span
    key={count}
    variants={popIn}
    initial="hidden"
    animate="visible"
    exit="exit"
    aria-label={label}
    style={style}
    className={cn(
      'pointer-events-none flex items-center justify-center rounded-full font-bold leading-none tabular-nums shadow-sm',
      className,
    )}
  >
    {formatCount(count)}
  </motion.span>
);

const segment =
  'relative flex w-full flex-1 items-center justify-center text-surface-foreground outline-none transition-colors ' +
  'duration-(--dur-fast) hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent [&_svg]:pointer-events-none';

interface MenuEntry {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  badge?: { count: number; className: string };
}

/** Pointer travel (px) before a press on the tab becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;

/**
 * The chat dock: a tab (market · chat · offers · menu caret) flush on the game's right edge, flat side against it. Nothing
 * opens on hover: a stray pointer passing over it mid-fight does nothing, only clicks do. Dragging the tab slides it
 * along the edge (`onDrag` gets the vertical travel). The caret opens a menu of the other windows, above the tab or
 * below it (`menuBelow`) near the top. A new message or offer pulses the tab once.
 */
export const ChatButton: React.FC<ChatButtonProps> = ({
  size,
  onChatClick,
  onOffersClick,
  onMarketClick,
  onNetWorthClick,
  onStashValueClick,
  onManageListingsClick,
  onSettingsClick,
  onCorruptedZoneClick,
  onCorruptionLuckClick,
  onDisableClick,
  unreadCount = 0,
  tradeOffersCount = 0,
  onDrag,
  onDragEnd,
  menuBelow = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);

  // One pulse per increase of either count (not on mount, not when they drop); adjusted during render, no effect
  const [pulse, setPulse] = useState(0);
  const [seen, setSeen] = useState({ unreadCount, tradeOffersCount });
  if (seen.unreadCount !== unreadCount || seen.tradeOffersCount !== tradeOffersCount) {
    if (unreadCount > seen.unreadCount || tradeOffersCount > seen.tradeOffersCount) setPulse((n) => n + 1);
    setSeen({ unreadCount, tradeOffersCount });
  }

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onEnter = () => window.clearTimeout(leaveTimer.current);
  const onLeave = () => {
    if (!menuOpen) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setMenuOpen(false), LEAVE_GRACE_MS);
  };
  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  // Press → drag past the threshold → onDrag(dy); the click that ends a drag is swallowed. Moves are tracked on the
  // window: a quick drag leaves the tab before the threshold, and pointer capture would retarget the buttons' clicks.
  const drag = useRef({ onDrag, onDragEnd });
  useEffect(() => {
    drag.current = { onDrag, onDragEnd };
  });
  const swallowClick = useRef(false);
  const onTabPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !onDrag) return;
    // The caret is a click target, not a drag handle: tiny pointer movements must still close its menu.
    if (e.target instanceof Element && e.target.closest('[data-dock-menu-toggle]')) return;
    const startY = e.clientY;
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dy) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        setMenuOpen(false);
      }
      drag.current.onDrag?.(dy);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!dragging) return;
      // The click (if any) follows this pointerup in the same task: swallow it, then stop swallowing
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false));
      drag.current.onDragEnd?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const onTabClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const w = size.width;
  const icon = { width: Math.round(w * 0.42), height: Math.round(w * 0.42) };
  const badge: React.CSSProperties = {
    position: 'absolute',
    top: Math.round(w * 0.04),
    right: Math.round(w * 0.04),
    minWidth: Math.round(w * 0.38),
    height: Math.round(w * 0.38),
    paddingInline: Math.max(2, Math.round(w * 0.06)),
    fontSize: Math.max(9, Math.round(w * 0.24)),
  };

  const entries: MenuEntry[] = [
    {
      label: '聊天',
      icon: MessageSquare,
      onClick: onChatClick,
      badge: { count: unreadCount, className: 'bg-destructive text-destructive-foreground' },
    },
    { label: '交易大厅', icon: Store, onClick: onMarketClick },
    { label: '仓库估值', icon: TrendingUp, onClick: onNetWorthClick },
    { label: '仓库价值', icon: Coins, onClick: onStashValueClick },
    {
      label: '报价',
      icon: ShoppingBag,
      onClick: onOffersClick,
      badge: { count: tradeOffersCount, className: 'bg-warning text-warning-foreground' },
    },
    { label: '管理上架物品', icon: List, onClick: onManageListingsClick },
    { label: '设置', icon: Settings, onClick: onSettingsClick },
    { label: '腐化区提示', icon: MapPin, onClick: onCorruptedZoneClick },
  ];

  return (
    <MotionConfig reducedMotion="user">
      {/* The frame is click-through: only the pill and the open menu take clicks. */}
      <div
        data-interactive="true"
        className="pointer-events-auto absolute"
        style={{ right: 0, bottom: 0, width: size.width, height: size.height }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        <AnimatePresence>
          {pulse > 0 && (
            <motion.span
              key={pulse}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-l-xl ring-2 ring-glow"
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.35 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        <div
          title={onDrag ? '拖动以移动' : undefined}
          className="flex h-full w-full touch-none flex-col overflow-hidden rounded-l-xl border border-r-0 border-border bg-surface shadow-panel backdrop-blur-md"
          onPointerDown={onTabPointerDown}
          onClickCapture={onTabClickCapture}
        >
          {onCorruptionLuckClick && (
            <button
              type="button"
              onClick={pick(onCorruptionLuckClick)}
              className={segment}
              aria-label="打开腐化前试试手气"
              title="腐化前试试手气"
            >
              <img
                src={corruptionShard}
                alt=""
                draggable={false}
                className="pointer-events-none drop-shadow-[0_0_4px_#e65b3b66]"
                style={{ width: Math.round(w * 0.56), height: Math.round(w * 0.56) }}
              />
            </button>
          )}
          {onMarketClick && (
            <button
              type="button"
              onClick={pick(onMarketClick)}
              className={segment}
              aria-label="打开交易大厅"
              title="交易大厅"
            >
              <Store style={icon} />
            </button>
          )}
          <button type="button" onClick={onChatClick} className={segment} aria-label="打开 PD2 聊天" title="聊天">
            <MessageSquare style={icon} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <CountBadge
                  key="unread"
                  count={unreadCount}
                  label={`${unreadCount} 条未读消息`}
                  className="bg-destructive text-destructive-foreground"
                  style={badge}
                />
              )}
            </AnimatePresence>
          </button>
          <button type="button" onClick={onOffersClick} className={segment} aria-label="报价" title="报价">
            <ShoppingBag style={icon} />
            <AnimatePresence>
              {tradeOffersCount > 0 && (
                <CountBadge
                  key="trade"
                  count={tradeOffersCount}
                  label={`${tradeOffersCount} 条交易报价`}
                  className="bg-warning text-warning-foreground"
                  style={badge}
                />
              )}
            </AnimatePresence>
          </button>
          <div aria-hidden className="mx-auto h-px w-1/2 shrink-0 bg-border" />
          <button
            type="button"
            data-dock-menu-toggle
            data-no-drag
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(segment, 'max-h-[30%] text-muted-foreground', menuOpen && 'bg-accent text-accent-foreground')}
            aria-label="更多"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={menuOpen ? '收起更多功能' : '展开更多功能'}
          >
            <ChevronUp
              style={{ width: icon.width * 0.85, height: icon.height * 0.85 }}
              className={cn('transition-transform duration-(--dur-med)', menuOpen !== menuBelow && 'rotate-180')}
            />
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              data-overlay-interactive
              aria-label="PD2 Trader"
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ transformOrigin: menuBelow ? 'top right' : 'bottom right' }}
              className={cn(
                'absolute right-0 w-52 rounded-lg border border-border bg-surface p-1 text-sm text-surface-foreground shadow-panel backdrop-blur-md',
                menuBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
              )}
            >
              {entries.map(
                ({ label, icon: Icon, onClick, badge: count }) =>
                  onClick && (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      onClick={pick(onClick)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{label}</span>
                      {count && count.count > 0 && (
                        <span
                          className={cn(
                            'min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold tabular-nums',
                            count.className,
                          )}
                        >
                          {formatCount(count.count)}
                        </span>
                      )}
                    </button>
                  ),
              )}
              {onDisableClick && (
                <>
                  <div role="separator" className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={pick(onDisableClick)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-destructive outline-none hover:bg-destructive/15 focus-visible:bg-destructive/15"
                  >
                    <X className="size-4 shrink-0" />
                    <span className="flex-1">关闭悬浮按钮</span>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
};
