import { useUiText } from '@/lib/ui-language';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormMessage } from '@/components/ui/form';
import React from 'react';
import { ISettings, NetWorthTickerAnchor, useOptions } from '@/hooks/useOptions';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsGroup, SettingsHint, SettingsLink, SettingsRow, SettingsSkeleton } from '../settings-ui';
import { PublicProfileGroup } from './public-profile';

const AUTO_SNAPSHOT_OPTIONS = [
  { value: '0', label: '关闭' },
  { value: '5', label: '每 5 分钟' },
  { value: '10', label: '每 10 分钟' },
  { value: '15', label: '每 15 分钟' },
  { value: '30', label: '每 30 分钟' },
];

const ANCHOR_OPTIONS: { value: NetWorthTickerAnchor; label: string }[] = [
  { value: 'top-left', label: '左上角' },
  { value: 'top-center', label: '顶部居中' },
  { value: 'top-right', label: '右上角' },
  { value: 'bottom-left', label: '左下角' },
  { value: 'bottom-right', label: '右下角' },
  { value: 'above-chat', label: '聊天按钮上方' },
  { value: 'custom', label: '自定义（拖动调整）' },
];

const netWorthFormSchema = z.object({
  netWorthTrackingEnabled: z.boolean(),
  netWorthAutoSnapshotMinutes: z.number().int().min(0),
  netWorthTickerEnabled: z.boolean(),
  netWorthTickerAnchor: z.enum([
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-right',
    'above-chat',
    'custom',
  ]),
  netWorthTickerOpacity: z.number().min(30).max(100),
  netWorthToastThresholdHr: z.number().min(0),
});

type NetWorthFormValues = z.infer<typeof netWorthFormSchema>;

function toFormValues(settings: ISettings | undefined): NetWorthFormValues {
  return {
    netWorthTrackingEnabled: settings?.netWorthTrackingEnabled !== false,
    netWorthAutoSnapshotMinutes: settings?.netWorthAutoSnapshotMinutes ?? 15,
    netWorthTickerEnabled: settings?.netWorthTickerEnabled ?? false,
    netWorthTickerAnchor: settings?.netWorthTickerAnchor ?? 'top-center',
    netWorthTickerOpacity: settings?.netWorthTickerOpacity ?? 90,
    netWorthToastThresholdHr: settings?.netWorthToastThresholdHr ?? 0.5,
  };
}

export function NetWorthForm() {
  const __ui = useUiText();
  const { settings, isLoading, updateSettings } = useOptions();
  const debounceRef = React.useRef<number | undefined>(undefined);

  const form = useForm<NetWorthFormValues>({
    resolver: zodResolver(netWorthFormSchema),
    defaultValues: toFormValues(settings),
  });

  // Reset form when settings change externally
  React.useEffect(() => {
    if (settings) {
      form.reset(toFormValues(settings), { keepDirty: false });
    }
  }, [settings, form]);

  // Auto-save on any change (debounced so slider drags and typing write once)
  const settingsRef = React.useRef(settings);
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  React.useEffect(() => {
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          const parsed = netWorthFormSchema.safeParse(values);
          if (!parsed.success) return;
          const current = settingsRef.current;
          const changed = Object.entries(parsed.data).some(
            ([key, val]) => current?.[key as keyof typeof current] !== val,
          );
          if (changed) updateSettings(parsed.data);
        }, 400);
      },
    });
    return () => {
      unsubscribe();
      window.clearTimeout(debounceRef.current);
    };
  }, [form, updateSettings]);

  if (isLoading || !settings) {
    return <SettingsSkeleton rows={6} />;
  }

  return (
    <Form {...form}>
      <div className="flex flex-col gap-y-6">
        <SettingsGroup title={__ui("估值历史")}>
          <FormField
            control={form.control}
            name="netWorthTrackingEnabled"
            render={({ field }) => (
              <SettingsRow
                label={__ui("保存估值历史")}
                description={__ui("将仓库估值快照保存到 pd2trader.com，以查看历史记录和游戏会话。关闭后仍会计算估值，但不会保存记录。")}
                control={
                  <FormControl>
                    <Switch checked={field.value}
                      onCheckedChange={field.onChange} />
                  </FormControl>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
          <FormField
            control={form.control}
            name="netWorthAutoSnapshotMinutes"
            render={({ field }) => (
              <SettingsRow
                label={__ui("自动记录快照")}
                description={__ui("Diablo II 处于前台时，按此间隔记录估值快照。")}
                control={
                  <Select value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder={__ui("选择间隔")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AUTO_SNAPSHOT_OPTIONS.map((option) => (
                        <SelectItem key={option.value}
                          value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <PublicProfileGroup />

        <SettingsGroup title={__ui("估值悬浮窗")}>
          <FormField
            control={form.control}
            name="netWorthTickerEnabled"
            render={({ field }) => (
              <SettingsRow
                label={__ui("显示估值悬浮窗")}
                description={__ui("在游戏画面上显示仓库估值、本次会话变化和每小时 HR 收益。点击悬浮窗可查看详情。")}
                control={
                  <FormControl>
                    <Switch checked={field.value}
                      onCheckedChange={field.onChange} />
                  </FormControl>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
          <FormField
            control={form.control}
            name="netWorthTickerAnchor"
            render={({ field }) => (
              <SettingsRow
                label={__ui("悬浮窗位置")}
                description={__ui("将悬浮窗固定在游戏画面的角落，或拖动到屏幕任意位置（会切换为自定义）。")}
                control={
                  <Select value={field.value}
                    onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder={__ui("选择位置")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ANCHOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value}
                          value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
          <FormField
            control={form.control}
            name="netWorthTickerOpacity"
            render={({ field }) => (
              <SettingsRow
                label={
                  <>
                    {" " + __ui("悬浮窗不透明度：") + ""}<span className="tabular-nums">{field.value}%</span>
                  </>
                }
                control={
                  <div className="flex w-[220px] items-center gap-3">
                    <FormControl>
                      <Slider
                        className="flex-1"
                        min={30}
                        max={100}
                        step={5}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                      />
                    </FormControl>
                    <span
                      aria-hidden
                      title={__ui("预览")}
                      style={{ opacity: field.value / 100 }}
                      className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-surface-foreground shadow-xs transition-opacity duration-(--dur-fast)"
                    >
                      <span className="text-q-gold">HR</span>
                    </span>
                  </div>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <SettingsGroup title={__ui("通知")}>
          <FormField
            control={form.control}
            name="netWorthToastThresholdHr"
            render={({ field }) => (
              <SettingsRow
                label={__ui("快照变化提醒阈值（HR）")}
                description={
                  <>
                    {" " + __ui("启用悬浮窗后，当快照显示的仓库估值变化达到此数值时弹出提醒。可在") + ""}<SettingsLink to="Chat">{"" + __ui("聊天设置") + ""}</SettingsLink>{"" + __ui("中开启仓库估值提醒。") + " "}</>
                }
                control={
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        className="w-[120px] tabular-nums"
                        value={Number.isFinite(field.value) ? field.value : ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
                      />
                    </FormControl>
                    <span className="text-xs font-medium text-muted-foreground">HR</span>
                  </div>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <SettingsHint>
          {" " + __ui("可在") + ""}<SettingsLink to="Hotkeys">{"" + __ui("快捷键设置") + ""}</SettingsLink>{"" + __ui("中配置记录估值快照的快捷键。") + " "}</SettingsHint>
      </div>
    </Form>
  );
}
