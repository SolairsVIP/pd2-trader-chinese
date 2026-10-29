import { useUiText } from '@/lib/ui-language';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import moment from 'moment';
import {
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  BellOff,
  Gamepad2,
  MessagesSquare,
  Pin,
  RotateCw,
  Search,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu';
import { ConversationMenuItems } from './ThreadHeader';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/pages/currency/components/StatePanel';
import { listItem, listStagger, popIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useChatListings } from '../hooks/useChatListings';
import { useKnownPresence } from '../hooks/useTraderProfile';
import type { InboxFilter, InboxThread } from '../lib/inbox';
import { findMarketLinks } from '../lib/market-links';
import { ChatAvatar, CountBadge, ReadReceipt, segmentedClass, segmentItemClass } from './chat-parts';
import { ListingThumb } from './ListingCard';
import { offerStatus } from './ThreadDeals';

const FILTERS: { value: Exclude<InboxFilter, 'archived'>; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'selling', label: '出售' },
  { value: 'buying', label: '求购' },
];

const EMPTY_TEXT: Record<InboxFilter, { title: string; description?: string }> = {
  all: { title: '暂无会话' },
  selling: {
    title: '当前没有出售中的物品',
    description: '买家对你挂单的报价和发送给你的交易密语会显示在这里。',
  },
  buying: {
    title: '当前没有求购物品',
    description: '你发出的报价和交易密语会显示在这里。',
  },
  archived: {
    title: '没有已归档的聊天',
    description: '可通过会话的“⋯”菜单归档；收到新消息后会自动恢复。',
  },
};

/** 会话列表中的简短时间：刚刚、12 分钟、下午 3:45、昨天、周二、3 月 4 日。 */
function formatConversationTime(timestamp: number) {
  const now = moment();
  const time = moment(timestamp);
  const minutes = now.diff(time, 'minutes');
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟`;
  if (time.isSame(now, 'day')) return time.format('h:mm A');
  if (time.isSame(now.clone().subtract(1, 'day'), 'day')) return '昨天';
  if (now.diff(time, 'days') < 7) return time.format('ddd');
  return time.format(time.isSame(now, 'year') ? 'M月D日' : 'YYYY年M月D日');
}

/** The listing the thread's latest website message links (its last link), if any. */
const latestLinkedId = (thread: InboxThread) => {
  const content = thread.latest?.message?.content;
  return content ? findMarketLinks(content).at(-1)?.listingId : undefined;
};

/**
 * The inbox sidebar (the whole panel in compact mode): one row per person, pinned first, with
 * All/Selling/Buying/Archived filters and search. `threads` are the rows to show (filtered and searched).
 * A row's avatar opens the person's Trader details.
 */
export function ConversationList({
  threads,
  total,
  unreadTotal,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  onOpenTrader,
  onThreadAction,
  loading,
  failed,
  signedIn,
  onReload,
  onClearHistory,
  clearingHistory,
  canClearHistory,
  now,
  className,
}: {
  threads: InboxThread[];
  /** Every thread, whatever the filter. */
  total: number;
  /** Unread messages outside muted and archived threads. */
  unreadTotal: number;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedId: string | null;
  onSelect: (threadId: string) => void;
  /** Opens the thread with its Trader details showing. */
  onOpenTrader: (threadId: string) => void;
  onThreadAction: (thread: InboxThread, action: 'pin' | 'mute' | 'archive' | 'delete' | 'forget') => void;
  loading: boolean;
  failed: boolean;
  signedIn: boolean;
  onReload: () => void;
  onClearHistory: () => void;
  clearingHistory: boolean;
  canClearHistory: boolean;
  /** Epoch ms, for presence dots. */
  now: number;
  className?: string;
}) {
  const __ui = useUiText();
  const panelRef = React.useRef<HTMLElement>(null);
  const [context, setContext] = React.useState<{ id: string; x: number; y: number } | null>(null);
  const contextThread = threads.find((thread) => thread.id === context?.id);
  const query = search.trim();
  const empty = EMPTY_TEXT[filter];
  const presenceOf = useKnownPresence(now);
  // The item each row's latest message links, as a thumbnail at the row's end
  const rowListings = useChatListings(threads.flatMap((thread) => latestLinkedId(thread) ?? []));

  let body: React.ReactNode;
  if (loading && total === 0) {
    body = (
      <div aria-busy
        className="space-y-1 p-2">
        <span className="sr-only">{"" + __ui("正在加载会话…") + ""}</span>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}
            className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between gap-4">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (failed && total === 0) {
    body = (
      <EmptyState
        compact
        className="px-4 pt-10"
        icon={<AlertTriangle />}
        title={__ui("无法加载会话")}
        description={__ui("请检查网络连接后重试。")}
        action={
          <Button variant="outline"
            size="sm"
            onClick={onReload}>
            <RotateCw className="size-3.5" />
            {" " + __ui("重试") + " "}</Button>
        }
      />
    );
  } else if (threads.length === 0) {
    body = (
      <EmptyState
        compact
        className="px-4 pt-10"
        icon={query ? <SearchX /> : filter === 'archived' ? <Archive /> : <MessagesSquare />}
        title={__ui(query ? '没有符合搜索条件的会话' : empty.title)}
        description={
          query
            ? undefined
            : (empty.description ? __ui(empty.description) :
              (signedIn
                ? __ui("网站聊天和游戏内密语会显示在这里。")
                : __ui("请前往“设置 → 账号”登录 Project Diablo 2。")))
        }
        action={
          query ? (
            <Button variant="ghost"
              size="sm"
              onClick={() => onSearchChange('')}>
              {" " + __ui("清除搜索") + " "}</Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <motion.ul
            aria-label={__ui("会话列表")}
        className="space-y-1 p-2"
        variants={listStagger}
        initial="hidden"
        animate="visible"
      >
        {threads.map((thread) => {
          const { name, latest } = thread;
          const selected = selectedId === thread.id;
          const unread = thread.unread > 0;
          const own = latest?.own;
          const linkedId = latestLinkedId(thread);
          const linkedState = linkedId ? rowListings.get(linkedId) : undefined;
          const linked = linkedState && 'listing' in linkedState ? linkedState.listing : undefined;
          const offer = thread.offers
            .filter((o) => offerStatus(o) === 'open')
            .reduce<
              (typeof thread.offers)[number] | undefined
            >((a, b) => (a && a.timestamp >= b.timestamp ? a : b), undefined);
          const presence = presenceOf(thread.userId)?.kind;
          return (
            <motion.li
              key={thread.id}
              onContextMenu={(event) => {
                event.preventDefault();
                const bounds = panelRef.current?.getBoundingClientRect();
                if (!bounds) return;
                setContext({ id: thread.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
              }}
              layout="position"
              variants={listItem}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-2.5 py-2',
                'transition-[background-color,box-shadow] duration-(--dur-fast) ease-out',
                selected
                  ? 'bg-linear-to-r from-primary/18 via-primary/10 to-primary/5 shadow-sm ring-1 ring-inset ring-primary/25'
                  : 'hover:bg-muted/60 hover:shadow-xs',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-2.5 -left-px w-[3px] rounded-full bg-primary transition-[opacity,transform] duration-(--dur-med)',
                  selected ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${name}的交易者详情`}
                onClick={() => onOpenTrader(thread.id)}
                className="relative z-10 shrink-0 rounded-full outline-none transition-transform duration-(--dur-fast) hover:scale-105 active:scale-95"
              >
                <ChatAvatar name={name}
                  presence={presence} />
              </button>
              {/* The whole row selects (the button's ::after covers it); the avatar sits above it */}
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(thread.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                      )}
                    >
                      {name}
                    </span>
                    {thread.muted && (
                      <BellOff
                        role="img"
                        aria-label={__ui("已静音")}
                        className="size-3 shrink-0 self-center text-muted-foreground/80"
                      />
                    )}
                    {thread.pinned && (
                      <Pin role="img"
                        aria-label={__ui("已置顶")}
                        className="size-3 shrink-0 self-center text-primary/80" />
                    )}
                    {latest && (
                      <span
                        className={cn(
                          'shrink-0 text-[11px] tabular-nums',
                          unread && !thread.muted ? 'font-semibold text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {formatConversationTime(latest.at)}
                      </span>
                    )}
                  </span>
                  {latest && (
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {latest.source === 'whisper' && (
                        <Gamepad2
                          role="img"
                          aria-label={__ui("游戏内密语")}
                          className="size-3 shrink-0 text-muted-foreground/70"
                        />
                      )}
                      {own && latest.message && (
                        <ReadReceipt message={latest.message}
                          readerId={thread.participant?._id}
                          className="shrink-0" />
                      )}
                      {linked && (
                        <ListingThumb
                          listing={linked}
                          className="size-4 rounded-[4px]"
                          artClassName="max-h-3.5 max-w-3.5"
                        />
                      )}
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          unread ? 'text-foreground/85' : 'text-muted-foreground',
                        )}
                      >
                        {own && <span className="text-muted-foreground">{"" + __ui("我：") + " "}</span>}
                        {linked ? latest.text.replace(/^📦 /, '') : latest.text}
                      </span>
                      {offer && (
                        <span
                          title={offer.isIncoming ? __ui("对方对你挂单发出的未完成报价") : __ui("你发出的未完成报价")}
                          className={cn(
                            'flex max-w-20 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums',
                            offer.isIncoming ? 'bg-success/15 text-success' : 'bg-info/15 text-info',
                          )}
                        >
                          {offer.isIncoming ? (
                            <ArrowUpRight aria-hidden
                              className="size-2.5 shrink-0" />
                          ) : (
                            <ArrowDownLeft aria-hidden
                              className="size-2.5 shrink-0" />
                          )}
                          <span className="truncate">{offer.price ?? __ui("报价")}</span>
                        </span>
                      )}
                      {unread && (
                        <CountBadge
                          count={thread.unread}
                          className={thread.muted ? 'bg-muted-foreground/60 shadow-none' : undefined}
                        />
                      )}
                    </span>
                  )}
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    );
  }

  return (
    <aside
      ref={panelRef}
      className={cn(
        'relative flex min-h-0 w-[300px] shrink-0 flex-col overflow-hidden border-r border-border bg-linear-to-b from-card/60 to-card/30',
        className,
      )}
    >
      <DropdownMenu open={!!contextThread} onOpenChange={(open) => { if (!open) setContext(null); }}>
        <DropdownMenuTrigger aria-label={__ui('会话选项')} tabIndex={-1}
          style={{ position: 'absolute', left: context?.x ?? 0, top: context?.y ?? 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <DropdownMenuContent align="start" sideOffset={0} onCloseAutoFocus={(event) => event.preventDefault()}>
          {contextThread && <ConversationMenuItems
            username={contextThread.participant?.username}
            characterName={contextThread.people.find((person) => person.characterName)?.characterName}
            pinned={contextThread.pinned} muted={contextThread.muted} archived={contextThread.archived}
            onTogglePin={() => onThreadAction(contextThread, 'pin')}
            onToggleMute={() => onThreadAction(contextThread, 'mute')}
            onToggleArchive={() => onThreadAction(contextThread, 'archive')}
            onForgetWhispers={contextThread.people.length ? () => onThreadAction(contextThread, 'forget') : undefined}
            onDeleteConversation={contextThread.conversation ? () => onThreadAction(contextThread, 'delete') : undefined}
          />}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="shrink-0 space-y-2.5 px-3 pb-3 pt-3">
        <div className="flex items-center gap-2 px-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{"" + __ui("消息") + ""}</h2>
          <AnimatePresence>
            {unreadTotal > 0 && (
              <motion.span key="unread"
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit">
                <CountBadge count={unreadTotal}
                  title={`${unreadTotal} 条未读`} />
              </motion.span>
            )}
          </AnimatePresence>
          {total > 0 && (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {total} {" " + __ui("个会话") + " "}</span>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={__ui('清除聊天记录')} title={__ui('清除聊天记录')} disabled={!canClearHistory || clearingHistory} className="size-8 text-muted-foreground">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{__ui('清除全部聊天记录？')}</AlertDialogTitle>
                <AlertDialogDescription>{__ui('将移除列表中的全部网站会话（通过官网归档）及本地游戏密语记录，包括已归档的记录和密语关联的交易信息。网站报价不受影响，此操作无法撤销。')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{__ui('取消')}</AlertDialogCancel>
                <AlertDialogAction onClick={onClearHistory}>{__ui('确认清除')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="group relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors duration-(--dur-fast) group-focus-within:text-foreground" />
          <Input
            placeholder={__ui("搜索聊天…")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                e.preventDefault();
                onSearchChange('');
              }
            }}
            className="h-8 rounded-lg border-border/70 bg-background/60 pl-8 pr-8 text-sm shadow-xs"
          />
          {search && (
            <button
              type="button"
              aria-label={__ui("清除搜索")}
              onClick={() => onSearchChange('')}
              className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          aria-label={__ui("显示范围")}
          value={filter}
          // Radix reports '' when the pressed item is clicked again: keep the current filter
          onValueChange={(value) => value && onFilterChange(value as InboxFilter)}
          className={cn('w-full', segmentedClass)}
        >
          {FILTERS.map(({ value, label }) => (
            <ToggleGroupItem key={value}
              value={value}
              className={cn('h-6 text-xs', segmentItemClass)}>
              {__ui(label)}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem
            value="archived"
            aria-label={__ui("已归档")}
            title={__ui("已归档的聊天")}
            className={cn('h-6 max-w-9 text-xs', segmentItemClass)}
          >
            <Archive className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mx-3 h-px shrink-0 bg-linear-to-r from-transparent via-border to-transparent" />
      <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-radix-scroll-area-viewport]>div]:!block">
        {body}
      </ScrollArea>
    </aside>
  );
}
