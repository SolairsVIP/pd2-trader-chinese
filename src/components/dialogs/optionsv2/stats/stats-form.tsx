import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormMessage } from '@/components/ui/form';
import React from 'react';
import { useOptions } from '@/hooks/useOptions';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSkeleton } from '../settings-ui';
import { DEFAULT_PRICE_WINDOW_HOURS, PRICE_WINDOW_OPTIONS } from '@/lib/price-window';

const statsFormSchema = z.object({
  fillStatValue: z.number().int().min(0).max(100).optional(),
  statFillMarginUnit: z.enum(['percent', 'flat']).optional(),
  statFillLeaveMinEmpty: z.boolean().optional(),
  statFillLeaveMaxEmpty: z.boolean().optional(),
  statDefaultCorruptedFilter: z.enum(['both', 'corrupted', 'non-corrupted']).optional(),
  rareRankDisplay: z.enum(['bar', 'blocks']).optional(),
  priceWindowHours: z.union([z.literal(24), z.literal(72), z.literal(168), z.literal(720)]).optional(),
});

type StatsFormValues = z.infer<typeof statsFormSchema>;

export function StatsForm() {
  const { settings, isLoading, updateSettings } = useOptions();
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  const form = useForm<StatsFormValues>({
    resolver: zodResolver(statsFormSchema),
    defaultValues: {
      fillStatValue: settings?.fillStatValue ?? 5,
      statFillMarginUnit: settings?.statFillMarginUnit ?? 'percent',
      statFillLeaveMinEmpty: settings?.statFillLeaveMinEmpty ?? false,
      statFillLeaveMaxEmpty: settings?.statFillLeaveMaxEmpty ?? false,
      statDefaultCorruptedFilter: settings?.statDefaultCorruptedFilter ?? 'both',
      rareRankDisplay: settings?.rareRankDisplay ?? 'bar',
      priceWindowHours: settings?.priceWindowHours ?? DEFAULT_PRICE_WINDOW_HOURS,
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset(
        {
          fillStatValue: settings.fillStatValue ?? 5,
          statFillMarginUnit: settings.statFillMarginUnit ?? 'percent',
          statFillLeaveMinEmpty: settings.statFillLeaveMinEmpty ?? false,
          statFillLeaveMaxEmpty: settings.statFillLeaveMaxEmpty ?? false,
          statDefaultCorruptedFilter: settings.statDefaultCorruptedFilter ?? 'both',
          rareRankDisplay: settings.rareRankDisplay ?? 'bar',
          priceWindowHours: settings.priceWindowHours ?? DEFAULT_PRICE_WINDOW_HOURS,
        },
        { keepDirty: false },
      );
    }
  }, [settings, form]);

  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  React.useEffect(() => {
    const subscription = form.watch((values) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const current = settingsRef.current;
        const changed = Object.entries(values).some(
          ([key, val]) => JSON.stringify(current?.[key as keyof typeof current]) !== JSON.stringify(val),
        );
        if (changed) updateSettings(values);
      }, 500);
    });
    return () => {
      subscription.unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form, updateSettings]);

  if (isLoading || !settings) {
    return <SettingsSkeleton rows={5} />;
  }

  const marginUnit = form.watch('statFillMarginUnit') ?? 'percent';

  return (
    <Form {...form}>
      <div className="flex flex-col gap-y-6">
        <SettingsGroup title="价格">
          <FormField
            control={form.control}
            name="priceWindowHours"
            render={({ field }) => (
              <SettingsRow
                label="价格统计区间"
                description="估价平均值使用的近期成交数据范围。成交较少的物品会改用更长的统计区间，并显示标记。"
                control={
                  <Select value={String(field.value ?? DEFAULT_PRICE_WINDOW_HOURS)}
                    onValueChange={(value) => field.onChange(Number(value))}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="选择价格区间" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRICE_WINDOW_OPTIONS.map((option) => (
                        <SelectItem key={option.hours}
                          value={String(option.hours)}>
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

        <SettingsGroup title="属性范围">
          <FormField
            control={form.control}
            name="fillStatValue"
            render={({ field }) => (
              <SettingsRow
                label={`填充属性数值（${marginUnit === 'percent' ? '%' : '固定值'}）`}
                description={
                  marginUnit === 'percent'
                    ? '填充属性范围时，按当前数值的一定百分比设置 ± 浮动范围。'
                    : '填充属性范围时，按固定数值设置 ± 浮动范围（例如 2 → ±2）。'
                }
                control={
                  <div className="flex w-[220px] items-center gap-2">
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5"
                        className="flex-1 tabular-nums"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === '' ? undefined : parseInt(value, 10));
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <span
                      aria-hidden
                      className="w-8 shrink-0 rounded-md bg-muted px-1.5 py-1 text-center text-xs font-medium text-muted-foreground"
                    >
                      {marginUnit === 'percent' ? '±%' : '±'}
                    </span>
                  </div>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
          <FormField
            control={form.control}
            name="statFillMarginUnit"
            render={({ field }) => (
              <SettingsRow
                label="浮动单位"
                description="设置上述填充值的计算方式。抗性、技能等级等数值范围较小的属性适合使用固定值。"
                control={
                  <Select value={field.value ?? 'percent'}
                    onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="选择浮动单位" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percent">百分比 (%)</SelectItem>
                      <SelectItem value="flat">固定值</SelectItem>
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
            name="statFillLeaveMinEmpty"
            render={({ field }) => (
              <SettingsRow
                label="最小值留空"
                description="填充属性范围时留空最小值，搜索时即可匹配不超过最大值的所有数值。"
                control={
                  <FormControl>
                    <Switch checked={field.value ?? false}
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
            name="statFillLeaveMaxEmpty"
            render={({ field }) => (
              <SettingsRow
                label="最大值留空"
                description="填充属性范围时留空最大值，搜索时即可匹配当前数值或更高的数值。"
                control={
                  <FormControl>
                    <Switch checked={field.value ?? false}
                      onCheckedChange={field.onChange} />
                  </FormControl>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <SettingsGroup title="筛选条件">
          <FormField
            control={form.control}
            name="statDefaultCorruptedFilter"
            render={({ field }) => (
              <SettingsRow
                label="默认腐化筛选"
                description="打开可腐化物品的估价窗口时默认使用的腐化筛选条件。"
                control={
                  <Select value={field.value ?? 'both'}
                    onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="选择腐化筛选" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="both">全部物品</SelectItem>
                      <SelectItem value="corrupted">仅限已腐化</SelectItem>
                      <SelectItem value="non-corrupted">仅限未腐化</SelectItem>
                    </SelectContent>
                  </Select>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <SettingsGroup title="稀有物品评估">
          <FormField
            control={form.control}
            name="rareRankDisplay"
            render={({ field }) => (
              <SettingsRow
                label="稀有物品评级显示"
                description="设置稀有物品估价弹窗中，该物品在同部位物品价格排名的显示方式。"
                control={
                  <Select value={field.value ?? 'bar'}
                    onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="选择评级显示方式" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bar">进度条（百分位 + 出售/保留参考线）</SelectItem>
                      <SelectItem value="blocks">分段条（6 个评级区间）</SelectItem>
                    </SelectContent>
                  </Select>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>
      </div>
    </Form>
  );
}
