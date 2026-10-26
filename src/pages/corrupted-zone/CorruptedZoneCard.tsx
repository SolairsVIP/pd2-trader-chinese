import React from 'react';
import { ChevronDown, ChevronUp, MapPin, RotateCcw, Settings, X } from 'lucide-react';
import { WindowPanel } from '@/components/custom/window-chrome';
import { countdown, localTime, rotationAt, upcomingRotations } from './schedule';
import { zoneStyle, type ZoneColors } from './appearance';
import {
  DAMAGE_CHOICES,
  DAMAGE_TYPES,
  damageSelection,
  zoneRecommendation,
  type DamageSelection,
} from './recommendation';

interface Props {
  now: number;
  expanded: boolean;
  customColors?: boolean;
  colors?: Partial<ZoneColors>;
  damageType?: DamageSelection;
  onDamageChange?: (damage: DamageSelection) => void;
  onExpand?: () => void;
  onClose?: () => void;
  onSettings?: () => void;
  onReset?: () => void;
  dragHandlers?: React.HTMLAttributes<HTMLDivElement>;
}

export default function CorruptedZoneCard({
  now,
  expanded,
  customColors = false,
  colors,
  damageType,
  onDamageChange,
  onExpand,
  onClose,
  onSettings,
  onReset,
  dragHandlers,
}: Props) {
  const current = rotationAt(now);
  const next = upcomingRotations(now);
  const selected = damageSelection(damageType);
  const advice = zoneRecommendation(current.zone.id, selected);
  const adviceClass = (status: string) =>
    status === 'caution'
      ? 'rounded bg-amber-100 px-1 text-amber-900'
      : status === 'suitable'
        ? 'rounded bg-emerald-100 px-1 text-emerald-900'
        : 'opacity-65';
  const buttonClass =
    'inline-flex size-6 shrink-0 cursor-default items-center justify-center rounded hover:bg-current/10 focus-visible:outline focus-visible:outline-2';
  return (
    <WindowPanel style={zoneStyle(customColors, colors)} className="w-full text-sm">
      <div
        {...dragHandlers}
        data-zone-strip
        className="relative flex min-h-[46px] shrink-0 touch-none select-none items-center gap-2 px-2 py-2 cursor-grab active:cursor-grabbing"
        title={`建房时间表预报 · 以游戏公告为准\n下一轮 ${localTime(next[0].start)} · ${next[0].zone.name}\n腐化区提示原作者：Blyat`}
      >
        <MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" />
        <span className="sr-only">腐化区提示</span>
        <div className="flex shrink-0 flex-col items-center">
          <span className="rounded bg-primary/15 px-1.5 text-base font-bold leading-6 text-primary">
            第{current.zone.act}幕
          </span>
          <button
            type="button"
            aria-label="切换主要伤害类型"
            title="点击轮换伤害类型；展开后可直接选择"
            className="rounded px-1 text-[11px] leading-4 hover:bg-current/10 focus-visible:outline"
            onClick={() =>
              onDamageChange?.(DAMAGE_CHOICES[(DAMAGE_CHOICES.indexOf(selected) + 1) % DAMAGE_CHOICES.length])
            }
          >
            {selected === 'none' ? '选伤害' : DAMAGE_TYPES[selected]} ▾
          </button>
        </div>
        <span
          className="flex min-w-0 flex-1 flex-col justify-center"
          title={`${current.zone.name}\n${current.zone.english}\n${current.zone.detail}`}
        >
          <span className="break-words text-center text-base font-semibold leading-5">{current.zone.name}</span>
          <span lang="en" className="break-words text-center text-[11px] leading-[14px] opacity-85">
            {current.zone.english}
          </span>
        </span>
        {selected !== 'none' && (
          <span
            aria-label="当前刷图建议"
            title={advice.detail}
            className={`shrink-0 px-1.5 py-1 text-xs font-semibold leading-4 ${adviceClass(advice.status)}`}
          >
            {advice.label}
          </span>
        )}
        <span
          className="min-w-[96px] shrink-0 rounded-md border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-center font-mono text-[26px] font-bold leading-8 tabular-nums text-primary"
          aria-label="剩余时间"
        >
          {countdown(current.end, now)}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {onReset && (
            <button
              type="button"
              className={buttonClass}
              title="恢复顶部居中"
              aria-label="恢复顶部居中"
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
            </button>
          )}
          {onSettings && (
            <button
              type="button"
              className={buttonClass}
              title="腐化区外观设置"
              aria-label="腐化区外观设置"
              onClick={onSettings}
            >
              <Settings className="size-3" />
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            aria-label={expanded ? '收起未来四轮' : '展开未来四轮'}
            aria-expanded={expanded}
            onClick={onExpand}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {onClose && (
            <button
              type="button"
              className={buttonClass}
              aria-label="隐藏腐化区提示"
              title="隐藏腐化区提示"
              onClick={onClose}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden bg-current/10"
          aria-hidden="true"
        >
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.max(0, ((current.end - now) / (current.end - current.start)) * 100)}%` }}
          />
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="主要伤害类型">
            <span className="mr-1 text-xs opacity-70">主伤害</span>
            {DAMAGE_CHOICES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={selected === type}
                onClick={() => onDamageChange?.(type)}
                className={`rounded border px-2 py-0.5 text-xs ${selected === type ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 hover:bg-current/10'}`}
              >
                {type === 'none' ? '不提示' : DAMAGE_TYPES[type]}
              </button>
            ))}
          </div>
          <p className="text-[11px] opacity-65">当前：{current.zone.name} · 每 15 分钟轮换</p>
          <ol aria-label="未来四轮" className="space-y-1.5">
            {next.map((r, i) => (
              <li
                key={r.start}
                className="flex items-start gap-2 text-xs leading-relaxed"
                title={`${r.zone.english}\n${r.zone.detail}`}
              >
                <span className="shrink-0 font-mono tabular-nums opacity-70">{localTime(r.start)}</span>
                <span className="min-w-0 flex-1 break-words">
                  {i === 0 ? '下一轮 · ' : ''}
                  {r.zone.name} <span className="font-semibold opacity-80">· 第 {r.zone.act} 幕</span>
                  <span lang="en" className="block text-[10px] leading-snug opacity-65">
                    {r.zone.english}
                  </span>
                </span>
                {selected !== 'none' && (
                  <span
                    className={`shrink-0 text-[10px] ${adviceClass(zoneRecommendation(r.zone.id, selected).status)}`}
                    title={zoneRecommendation(r.zone.id, selected).detail}
                  >
                    {zoneRecommendation(r.zone.id, selected).label}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <footer className="space-y-0.5 border-t border-border/60 pt-1.5 text-[10px] leading-relaxed opacity-65">
            <p>腐化区提示原作者：Blyat</p>
          </footer>
        </div>
      )}
    </WindowPanel>
  );
}
