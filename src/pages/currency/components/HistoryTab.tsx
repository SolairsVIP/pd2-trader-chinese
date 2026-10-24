import React, { useCallback, useMemo, useState } from 'react';
import { localizeItemName } from '@/lib/localize-item-name';
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import moment from 'moment';
import {
  ChartArea,
  GitCompareArrows,
  History as HistoryIcon,
  Loader2,
  Play,
  ShieldCheck,
  Square,
  Star,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { fadeInUp, listItem, listStagger, useReducedMotionSafe } from '@/lib/motion';
import {
  deleteHistory,
  getDiff,
  getPoints,
  getSessions,
  NET_WORTH_CATEGORIES,
  type NetWorthCategory,
  type NetWorthOwner,
  type NetWorthPoint,
  type Season,
  type SessionSummary,
} from '@/lib/networth-api';
import { useNetWorth } from '@/hooks/useNetWorth';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_NAME_CLASS,
  deltaClass,
  deltaPillClass,
  formatDuration,
  formatSignedHr,
} from '../lib/networth-format';
import { useNetWorthQuery } from '../lib/useNetWorthQuery';
import { Banner, EmptyState } from './StatePanel';

type Range = '24h' | '7d' | 'season' | 'all';

interface HistoryTabProps {
  token: string;
  owner: NetWorthOwner;
  seasons: Season[];
  currentSeasonId: string | null;
  seasonPoints: NetWorthPoint[] | null;
  /** Changes whenever a new snapshot lands; triggers reloads. */
  refreshKey: string | null;
  onHistoryChanged: () => void;
}

const SNAPSHOT_PAGE = 30;
const SESSION_PAGE = 8;
const SESSION_CALENDAR = {
  sameDay: '[今天] HH:mm',
  lastDay: '[昨天] HH:mm',
  lastWeek: 'ddd HH:mm',
  sameElse: 'M月D日 HH:mm',
};
const RANGES: { value: Range; label: string }[] = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: 'season', label: '本赛季' },
  { value: 'all', label: '全部' },
];

function SectionHeader({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight">
        {title}
        {meta !== undefined && <span className="text-xs font-normal text-muted-foreground">{meta}</span>}
      </h3>
      {children}
    </div>
  );
}

function ShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full py-2 text-xs font-medium text-muted-foreground outline-none transition-colors duration-(--dur-fast) hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40"
      onClick={onClick}
    >
      展开更多（还有 {remaining} 条较早记录）
    </button>
  );
}

export function HistoryTab(props: HistoryTabProps) {
  const { token, owner, seasons, currentSeasonId, seasonPoints, refreshKey, onHistoryChanged } = props;
  const [range, setRange] = useState<Range>('7d');
  const [stacked, setStacked] = useState(false);

  const loadRange = useCallback(async (): Promise<NetWorthPoint[]> => {
    const seasonId = currentSeasonId ?? undefined;
    if (range === '24h' || range === '7d') {
      const from = moment()
        .subtract(range === '24h' ? 24 : 24 * 7, 'hours')
        .toISOString();
      return (await getPoints(token, owner, { seasonId, from, resolution: 'raw' })).points;
    }
    if (range === 'all') {
      const perSeason = await Promise.all(
        seasons.map((season) => getPoints(token, owner, { seasonId: season.id, resolution: 'day' })),
      );
      return perSeason.flatMap((r) => r.points).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    }
    return [];
  }, [token, owner, currentSeasonId, seasons, range]);

  const rangeQuery = useNetWorthQuery(range === 'season' ? null : loadRange, refreshKey);
  const points = range === 'season' ? seasonPoints : rangeQuery.data;
  const rangeChange = points && points.length > 1 ? points[points.length - 1].totalHr - points[0].totalHr : null;
  const reloading = range !== 'season' && rangeQuery.loading && points !== null;

  return (
    <div className="space-y-7">
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={range}
              onValueChange={(v) => v && setRange(v as Range)}
              aria-label="图表时间范围"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem key={r.value}
                  value={r.value}
                  className="flex-none px-3 text-xs">
                  {r.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <AnimatePresence initial={false}
              mode="wait">
              {reloading ? (
                <motion.span key="loading"
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  exit="exit">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </motion.span>
              ) : rangeChange !== null ? (
                <motion.span
                  key={`change-${range}`}
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                    deltaPillClass(rangeChange),
                  )}
                  title="所选时间范围内的变化"
                >
                  {formatSignedHr(rangeChange)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="stacked"
              checked={stacked}
              onCheckedChange={setStacked} />
            <Label htmlFor="stacked"
              className="cursor-pointer text-xs text-muted-foreground">
              按类别堆叠
            </Label>
          </div>
        </div>
        {rangeQuery.error && range !== 'season' ? (
          <Banner
            tone="destructive"
            role="alert"
            icon={<ChartArea />}
            actions={
              <Button size="sm"
                variant="outline"
                onClick={rangeQuery.reload}>
                重试
              </Button>
            }
          >
            <span className="text-destructive">{rangeQuery.error}</span>
          </Banner>
        ) : points === null ? (
          <Skeleton className="h-60 w-full rounded-lg" />
        ) : (
          <NetWorthChart points={points}
            stacked={stacked}
            seasons={seasons} />
        )}
      </section>

      <SessionsSection token={token}
        owner={owner}
        seasonId={currentSeasonId}
        refreshKey={refreshKey} />

      <SnapshotsSection token={token}
        owner={owner}
        points={points ?? []} />

      <DeleteHistory
        token={token}
        owner={owner}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onDeleted={() => {
          onHistoryChanged();
          rangeQuery.reload();
        }}
      />
    </div>
  );
}

const chartConfig: ChartConfig = {
  totalHr: { label: '仓库总估值', color: 'var(--chart-1)' },
  ...Object.fromEntries(NET_WORTH_CATEGORIES.map((c) => [c, { label: CATEGORY_LABELS[c], color: CATEGORY_COLORS[c] }])),
};

type ChartRow = { t: number; totalHr: number } & Partial<Record<NetWorthCategory, number>>;

function ChartTooltipCard({ row, stacked }: { row: ChartRow; stacked: boolean }) {
  return (
    <div className="min-w-36 rounded-lg border border-border bg-surface-elevated px-2.5 py-2 text-xs text-popover-foreground shadow-panel backdrop-blur-md">
      <p className="text-muted-foreground">{moment(row.t).format('MMM D HH:mm')}</p>
      <p className="text-sm font-semibold tabular-nums">{row.totalHr.toFixed(2)} HR</p>
      {stacked && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
          {NET_WORTH_CATEGORIES.filter((c) => (row[c] ?? 0) > 0).map((c) => (
            <p key={c}
              className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full"
                  style={{ background: CATEGORY_COLORS[c] }} />
                {CATEGORY_LABELS[c]}
              </span>
              <span className="tabular-nums">{(row[c] ?? 0).toFixed(2)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function NetWorthChart({ points, stacked, seasons }: { points: NetWorthPoint[]; stacked: boolean; seasons: Season[] }) {
  const reduce = useReducedMotionSafe();
  const data = useMemo<ChartRow[]>(
    () => points.map((p) => ({ t: Date.parse(p.takenAt), totalHr: p.totalHr, ...p.byCategory })),
    [points],
  );
  if (data.length === 0) {
    return (
      <EmptyState
        className="h-60 justify-center py-0"
        icon={<ChartArea />}
        title="此时间范围内暂无估值快照"
        description="程序启动时、Diablo II 窗口处于前台时，以及手动刷新时都会记录快照。"
      />
    );
  }
  const first = data[0].t;
  const last = data[data.length - 1].t;
  const spanHours = (last - first) / 3_600_000;
  const tickFormat = spanHours <= 36 ? 'HH:mm' : spanHours <= 24 * 10 ? 'ddd HH:mm' : 'MMM D';
  const boundaries = seasons
    .map((s) => ({ t: Date.parse(s.startDate), label: s.label }))
    .filter((b) => b.t > first && b.t <= last);
  const animation = { isAnimationActive: !reduce, animationDuration: 500, animationEasing: 'ease-out' as const };

  return (
    <div className="rounded-lg border border-border bg-card/40 px-1 pb-1 pt-3">
      <ChartContainer config={chartConfig}
        className="aspect-auto h-56 w-full">
        <AreaChart data={data}
          margin={{ left: 0, right: 12, top: 8 }}>
          <defs>
            <linearGradient id="nw-total-fill"
              x1="0"
              y1="0"
              x2="0"
              y2="1">
              <stop offset="0%"
                stopColor="var(--chart-1)"
                stopOpacity={0.45} />
              <stop offset="100%"
                stopColor="var(--chart-1)"
                stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false}
            strokeDasharray="3 4"
            stroke="var(--border)"
            strokeOpacity={0.7} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => moment(t).format(tickFormat)}
            minTickGap={40}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
          />
          <YAxis
            width={40}
            tickFormatter={(v: number) => v.toFixed(0)}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.5, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const row = active && (payload?.[0]?.payload as ChartRow | undefined);
              if (!row) return null;
              return <ChartTooltipCard row={row}
                stacked={stacked} />;
            }}
          />
          {stacked ? (
            NET_WORTH_CATEGORIES.map((c) => (
              <Area
                key={c}
                dataKey={c}
                type="monotone"
                stackId="cat"
                stroke={CATEGORY_COLORS[c]}
                strokeWidth={1.5}
                fill={CATEGORY_COLORS[c]}
                fillOpacity={0.35}
                activeDot={false}
                {...animation}
              />
            ))
          ) : (
            <Area
              dataKey="totalHr"
              type="monotone"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#nw-total-fill)"
              fillOpacity={1}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--chart-1)' }}
              {...animation}
            />
          )}
          {boundaries.map((b) => (
            <ReferenceLine
              key={b.t}
              x={b.t}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.7}
              strokeDasharray="4 4"
              label={{ value: b.label, position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function SessionsSection({
  token,
  owner,
  seasonId,
  refreshKey,
}: {
  token: string;
  owner: NetWorthOwner;
  seasonId: string | null;
  refreshKey: string | null;
}) {
  const { currentSession, startSession, stopSession } = useNetWorth();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(SESSION_PAGE);
  const load = useCallback(async () => {
    return (await getSessions(token, owner, seasonId ?? undefined)).sessions;
  }, [token, owner, seasonId]);
  const { data: sessions, error, reload } = useNetWorthQuery(load, refreshKey);
  const bestId = useMemo(() => {
    const ranked = (sessions ?? []).filter((s) => s.durationMinutes >= 10 && s.farmedHr > 0);
    return ranked.sort((a, b) => b.hrPerHour - a.hrPerHour)[0]?.id ?? null;
  }, [sessions]);

  const mark = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <section className="space-y-2.5">
      <SectionHeader title="游戏会话"
        meta={sessions && sessions.length > 0 ? sessions.length : undefined}>
        <div className="flex gap-2">
          <Button size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => mark(startSession)}>
            <Play className="size-3.5" /> 开始新会话
          </Button>
          <Button size="sm"
            variant="outline"
            disabled={busy || !currentSession}
            onClick={() => mark(stopSession)}>
            <Square className="size-3.5" /> 结束会话
          </Button>
        </div>
      </SectionHeader>
      {error && (
        <Banner tone="destructive"
          role="alert"
          icon={<Timer />}>
          <span className="text-destructive">{error}</span>
        </Banner>
      )}
      {!sessions && !error && (
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      {sessions && sessions.length === 0 && (
        <EmptyState
          compact
          icon={<Timer />}
          title="暂无游戏会话"
          description="间隔少于 30 分钟的估值快照会自动合并为一个会话。"
        />
      )}
      {sessions && sessions.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card/40 text-sm">
          <div className="grid grid-cols-[1fr_4.5rem_5.5rem_5.5rem_4rem] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>时间</span>
            <span className="text-right">时长</span>
            <span className="text-right">物品增值</span>
            <span className="text-right">市场变动</span>
            <span className="text-right">HR/小时</span>
          </div>
          <motion.div variants={listStagger}
            initial="hidden"
            animate="visible"
            className="divide-y divide-border/60">
            {sessions.slice(0, limit).map((s) => (
              <SessionRow key={s.id}
                session={s}
                best={s.id === bestId} />
            ))}
          </motion.div>
          {sessions.length > limit && (
            <div className="border-t border-border/60">
              <ShowMore remaining={sessions.length - limit}
                onClick={() => setLimit((l) => l + SESSION_PAGE)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SessionRow({ session: s, best }: { session: SessionSummary; best: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          variants={listItem}
          tabIndex={0}
          className={cn(
            'grid cursor-default grid-cols-[1fr_4.5rem_5.5rem_5.5rem_4rem] items-center gap-2 px-3 py-2 outline-none transition-colors duration-(--dur-fast) hover:bg-muted/40 focus-visible:bg-muted/40',
            s.isOpen && 'bg-success/5',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {s.isOpen && (
              <span className="relative flex size-2 shrink-0"
                aria-label="正在进行的会话">
                <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
            )}
            <span className="truncate">
              {moment(s.start).calendar(null, SESSION_CALENDAR)}–{moment(s.end).format('HH:mm')}
            </span>
            {s.manual && (
              <span className="shrink-0 rounded-sm border border-border px-1 text-[10px] leading-4 text-muted-foreground">
                手动
              </span>
            )}
            {best && (
              <Star className="size-3.5 shrink-0 fill-q-unique text-q-unique"
                aria-label="本赛季最高 HR/小时收益" />
            )}
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{formatDuration(s.durationMinutes)}</span>
          <span className={cn('text-right font-medium tabular-nums', deltaClass(s.farmedHr))}>
            {formatSignedHr(s.farmedHr)}
          </span>
          <span className={cn('text-right tabular-nums', deltaClass(s.marketDriftHr))}>
            {formatSignedHr(s.marketDriftHr)}
          </span>
          <span className="text-right font-medium tabular-nums">{s.hrPerHour.toFixed(2)}</span>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom"
        className="max-w-xs">
        <p className="mb-1 font-medium tabular-nums">
          {s.startHr.toFixed(2)} → {s.endHr.toFixed(2)} HR · {s.snapshotCount} 个估值快照
        </p>
        {s.topGains.length > 0 ? (
          s.topGains.map((g) => (
            <p key={g.key}
              className="flex justify-between gap-3 tabular-nums">
              <span>
                {g.qtyDelta > 0 ? '+' : ''}
                {g.qtyDelta}× {localizeItemName(g.name)}
              </span>
              <span className={deltaClass(g.valueDelta)}>({formatSignedHr(g.valueDelta)})</span>
            </p>
          ))
        ) : (
          <p className="text-muted-foreground">没有物品增值。</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function SnapshotsSection({ token, owner, points }: { token: string; owner: NetWorthOwner; points: NetWorthPoint[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(SNAPSHOT_PAGE);
  const [priceBasis, setPriceBasis] = useState<'then' | 'now'>('then');
  const rows = useMemo(() => [...points].reverse(), [points]);

  const pair = useMemo(() => {
    if (selected.length !== 2) return null;
    const [a, b] = selected.map((id) => points.find((p) => p.snapshotId === id)).filter(Boolean) as NetWorthPoint[];
    if (!a || !b) return null;
    return a.takenAt <= b.takenAt ? { from: a, to: b } : { from: b, to: a };
  }, [selected, points]);

  const loadDiff = useCallback(
    async () => (pair ? getDiff(token, owner, pair.from.snapshotId, pair.to.snapshotId, priceBasis) : null),
    [token, owner, pair, priceBasis],
  );
  const diff = useNetWorthQuery(pair ? loadDiff : null);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current.slice(-1), id]));

  return (
    <section className="space-y-2.5">
      <SectionHeader title="估值快照"
        meta={rows.length > 0 ? rows.length : undefined}>
        {selected.length > 0 ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">已选择 {selected.length}/2 条</span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 font-medium text-foreground/80 outline-none transition-colors duration-(--dur-fast) hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => setSelected([])}
            >
              清除
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">选择两条记录进行比较</span>
        )}
      </SectionHeader>
      {rows.length === 0 ? (
        <EmptyState compact
          icon={<HistoryIcon />}
          title="此时间范围内暂无估值快照" />
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-card/40 text-sm">
          <div className="divide-y divide-border/60">
            {rows.slice(0, limit).map((p, i) => {
              const prev = rows[i + 1];
              const change = prev ? p.totalHr - prev.totalHr : null;
              const isSelected = selected.includes(p.snapshotId);
              return (
                <div
                  key={p.snapshotId}
                  data-selected={isSelected || undefined}
                  className={cn(
                    'relative grid grid-cols-[1.5rem_1fr_5rem_5.5rem_4.5rem_2rem] items-center gap-2 px-3 py-1 transition-colors duration-(--dur-fast) hover:bg-muted/40',
                    'before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity before:duration-(--dur-fast)',
                    isSelected && 'bg-primary/8 before:opacity-100 hover:bg-primary/10',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={!p.hasHoldings}
                    aria-label={`选择估值快照 ${moment(p.takenAt).format('M月D日 HH:mm')}`}
                    onCheckedChange={() => toggle(p.snapshotId)}
                  />
                  <span className="truncate tabular-nums">{moment(p.takenAt).format('MMM D HH:mm')}</span>
                  <span className="text-right font-medium tabular-nums">{p.totalHr.toFixed(2)}</span>
                  <span className={cn('text-right tabular-nums', deltaClass(change))}>
                    {change === null ? '' : formatSignedHr(change)}
                  </span>
                  <span className="flex justify-end">
                  <span className="rounded-full bg-muted/60 px-1.5 text-[11px] leading-5 text-muted-foreground">
                      {({ manual: '手动', interval: '定时', startup: '启动时', web: '网页' } as const)[p.trigger]}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    title="与上一条比较"
                    aria-label="与上一条估值快照比较"
                    disabled={!prev || !p.hasHoldings || !prev.hasHoldings}
                    onClick={() => prev && setSelected([prev.snapshotId, p.snapshotId])}
                  >
                    <GitCompareArrows className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
          {rows.length > limit && (
            <div className="border-t border-border/60">
              <ShowMore remaining={rows.length - limit}
                onClick={() => setLimit((l) => l + SNAPSHOT_PAGE)} />
            </div>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {pair && (
          <motion.div
            key="diff"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-3 rounded-lg border border-border bg-card/60 p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-medium tabular-nums">
                <GitCompareArrows className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {moment(pair.from.takenAt).format('MMM D HH:mm')} → {moment(pair.to.takenAt).format('MMM D HH:mm')}
                </span>
                {diff.loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={priceBasis}
                  onValueChange={(v) => v && setPriceBasis(v as 'then' | 'now')}
                  aria-label="价格依据"
                >
                  <ToggleGroupItem value="then"
                    className="flex-none px-3 text-xs">
                    使用当时价格
                  </ToggleGroupItem>
                  <ToggleGroupItem value="now"
                    className="flex-none px-3 text-xs">
                    使用当前价格
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="关闭比较结果"
                  onClick={() => setSelected([])}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            {diff.error && (
              <Banner tone="destructive"
                role="alert"
                icon={<GitCompareArrows />}>
                <span className="text-destructive">{diff.error}</span>
              </Banner>
            )}
            {diff.loading && (
              <div className="space-y-1.5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            )}
            {diff.data && !diff.loading && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <DiffStat label="物品增值">
                    <span className={deltaClass(diff.data.farmedHr)}>{formatSignedHr(diff.data.farmedHr)}</span>
                  </DiffStat>
                  <DiffStat label="市场变动">
                    <span className={deltaClass(diff.data.marketDriftHr)}>
                      {formatSignedHr(diff.data.marketDriftHr)}
                    </span>
                  </DiffStat>
                  <DiffStat label="总计">
                    {diff.data.from.totalHr.toFixed(2)} → {diff.data.to.totalHr.toFixed(2)} HR
                  </DiffStat>
                </div>
                {diff.data.lines.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">物品数量没有变化。</p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border/70">
                    <div className="grid grid-cols-[1fr_6rem_4rem_5.5rem] gap-2 border-b border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <span>物品</span>
                      <span className="text-right">数量</span>
                      <span className="text-right">变化</span>
                      <span className="text-right">价值变化</span>
                    </div>
                    <motion.div
                      variants={listStagger}
                      initial="hidden"
                      animate="visible"
                      className="max-h-60 divide-y divide-border/50 overflow-y-auto text-sm"
                    >
                      {diff.data.lines.map((line) => (
                        <motion.div
                          key={line.key}
                          variants={listItem}
                          className="grid grid-cols-[1fr_6rem_4rem_5.5rem] gap-2 px-2.5 py-1.5 transition-colors duration-(--dur-fast) hover:bg-muted/40"
                        >
                          <span className={cn('truncate', CATEGORY_NAME_CLASS[line.category])} title={line.name}>{localizeItemName(line.name, line.category === 'uniques' ? 'Unique' : line.category === 'sets' ? 'Set' : undefined)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">
                            {line.qtyFrom} → {line.qtyTo}
                          </span>
                          <span className={cn('text-right tabular-nums', deltaClass(line.qtyDelta))}>
                            {line.qtyDelta > 0 ? '+' : ''}
                            {line.qtyDelta}
                          </span>
                          <span className={cn('text-right font-medium tabular-nums', deltaClass(line.valueDelta))}>
                            {formatSignedHr(line.valueDelta)}
                          </span>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function DiffStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{children}</p>
    </div>
  );
}

function DeleteHistory({
  token,
  owner,
  seasons,
  currentSeasonId,
  onDeleted,
}: {
  token: string;
  owner: NetWorthOwner;
  seasons: Season[];
  currentSeasonId: string | null;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const seasonLabel = seasons.find((s) => s.id === currentSeasonId)?.label ?? '本赛季';

  const run = async (seasonId?: string) => {
    setBusy(true);
    try {
      const { deletedPoints } = await deleteHistory(token, owner, seasonId);
      setResult({ ok: true, text: `已删除 ${deletedPoints} 个估值快照。` });
      onDeleted();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex items-center justify-between gap-4 border-t border-border pt-4">
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-px size-3.5 shrink-0 opacity-80" />
        <span>
          历史记录仅对你的 PD2 账号可见，并保存在 pd2trader.com。{' '}
          {result && (
            <span role="status"
              className={cn('font-medium', result.ok ? 'text-success' : 'text-destructive')}>
              {result.text}
            </span>
          )}
        </span>
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} 删除历史记录
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <Trash2 className="size-4" />
              </span>
              <AlertDialogTitle>确定删除仓库估值历史记录吗？</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              将删除账号 {owner.account} 的估值快照（{owner.isLadder ? '天梯' : '非天梯'}、{' '}
              {owner.isHardcore ? '专家模式' : '普通模式'}）。此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            {currentSeasonId && (
              <AlertDialogAction
                className={buttonVariants({
                  variant: 'outline',
                  className:
                    'border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive',
                })}
                onClick={() => run(currentSeasonId)}
              >
                删除 {seasonLabel} 的记录
              </AlertDialogAction>
            )}
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })}
              onClick={() => run()}>
              删除所有赛季记录
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
