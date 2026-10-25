import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormMessage } from '@/components/ui/form';
import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useOptions } from '@/hooks/useOptions';
import { AlertTriangle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsGroup, SettingsHint, SettingsRow, SettingsSkeleton } from '../settings-ui';

const hotkeyFormSchema = z
  .object({
    hotkeyModifier: z.enum(['ctrl', 'alt']),
    hotkeyKey: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierListItem: z.enum(['ctrl', 'alt']),
    hotkeyKeyListItem: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierSettings: z.enum(['ctrl', 'alt']),
    hotkeyKeySettings: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierCurrencyValuation: z.enum(['ctrl', 'alt']),
    hotkeyKeyCurrencyValuation: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierChat: z.enum(['ctrl', 'alt']),
    hotkeyKeyChat: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierOffers: z.enum(['ctrl', 'alt']),
    hotkeyKeyOffers: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierDelist: z.enum(['ctrl', 'alt']),
    hotkeyKeyDelist: z
      .string()
      .min(1, '请输入按键')
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]$/i, '请输入英文字母或数字'),
    hotkeyModifierSnapshot: z.enum(['ctrl', 'alt']),
    hotkeyKeySnapshot: z
      .string()
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]?$/i, '请输入英文字母或数字'),
    hotkeyModifierMarket: z.enum(['ctrl', 'alt']),
    hotkeyKeyMarket: z
      .string()
      .max(1, '只能输入一个字符')
      .regex(/^[a-z0-9]?$/i, '请输入英文字母或数字'),
  })
  .refine((data) => !(data.hotkeyModifier === 'ctrl' && data.hotkeyKey?.toLowerCase() === 'c'), {
    message: '不能使用 Ctrl + C（这是系统保留快捷键）。',
    path: ['hotkeyKey'],
  });

type HotkeyFormValues = z.infer<typeof hotkeyFormSchema>;

type ModifierField = {
  [K in keyof HotkeyFormValues]: K extends `hotkeyModifier${string}` ? K : never;
}[keyof HotkeyFormValues];
type KeyField = {
  [K in keyof HotkeyFormValues]: K extends `hotkeyKey${string}` ? K : never;
}[keyof HotkeyFormValues];

interface HotkeyRowConfig {
  label: string;
  description: string;
  modifier: ModifierField;
  key: KeyField;
  /** Key may be left empty (unbound). */
  optional?: boolean;
}

const HOTKEY_ROWS: HotkeyRowConfig[] = [
  {
    label: '物品估价',
    description: '估算光标指向的物品价格。',
    modifier: 'hotkeyModifier',
    key: 'hotkeyKey',
  },
  {
    label: '上架物品',
    description: '将光标指向的物品挂到市场出售。',
    modifier: 'hotkeyModifierListItem',
    key: 'hotkeyKeyListItem',
  },
  {
    label: '打开设置',
    description: '打开设置窗口。',
    modifier: 'hotkeyModifierSettings',
    key: 'hotkeyKeySettings',
  },
  {
    label: '仓库估值',
    description: '打开仓库估值窗口。',
    modifier: 'hotkeyModifierCurrencyValuation',
    key: 'hotkeyKeyCurrencyValuation',
  },
  {
    label: '聊天窗口',
    description: '显示或隐藏聊天窗口。',
    modifier: 'hotkeyModifierChat',
    key: 'hotkeyKeyChat',
  },
  {
    label: '交易报价',
    description: '打开与你正在交易的玩家之间的聊天。',
    modifier: 'hotkeyModifierOffers',
    key: 'hotkeyKeyOffers',
  },
  {
    label: '下架物品',
    description: '将光标指向的物品从市场下架。',
    modifier: 'hotkeyModifierDelist',
    key: 'hotkeyKeyDelist',
  },
  {
    label: '记录估值快照',
    description: '立即记录仓库估值快照。',
    modifier: 'hotkeyModifierSnapshot',
    key: 'hotkeyKeySnapshot',
    optional: true,
  },
  {
    label: '市场浏览器',
    description: '显示或隐藏市场浏览器。',
    modifier: 'hotkeyModifierMarket',
    key: 'hotkeyKeyMarket',
    optional: true,
  },
];

export function HotkeyForm() {
  const { settings, isLoading, updateSettings } = useOptions();

  const form = useForm<HotkeyFormValues>({
    resolver: zodResolver(hotkeyFormSchema),
    defaultValues: (settings as HotkeyFormValues) || {
      hotkeyModifier: 'ctrl',
      hotkeyKey: '',
      hotkeyModifierListItem: 'ctrl',
      hotkeyKeyListItem: '',
      hotkeyModifierSettings: 'ctrl',
      hotkeyKeySettings: '',
      hotkeyModifierCurrencyValuation: 'ctrl',
      hotkeyKeyCurrencyValuation: '',
      hotkeyModifierChat: 'ctrl',
      hotkeyKeyChat: 't',
      hotkeyModifierOffers: 'ctrl',
      hotkeyKeyOffers: 'b',
      hotkeyModifierDelist: 'ctrl',
      hotkeyKeyDelist: 'u',
      hotkeyModifierSnapshot: 'ctrl',
      hotkeyKeySnapshot: '',
      hotkeyModifierMarket: 'ctrl',
      hotkeyKeyMarket: 'm',
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset(settings, { keepDirty: false });
    }
  }, [settings]);

  // Auto-save on any change
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  React.useEffect(() => {
    const subscription = form.watch((values) => {
      const current = settingsRef.current;
      const changed = Object.entries(values).some(([key, val]) => current?.[key as keyof typeof current] !== val);
      if (changed) updateSettings(values);
    });
    return () => subscription.unsubscribe();
  }, [form, updateSettings]);

  if (isLoading || !settings) {
    return <SettingsSkeleton rows={HOTKEY_ROWS.length} />;
  }

  const values = form.watch();
  const comboOf = (row: HotkeyRowConfig) => {
    const key = (values[row.key] as string | undefined)?.toLowerCase();
    return key ? `${values[row.modifier]}+${key}` : null;
  };
  const warningFor = (row: HotkeyRowConfig): string | null => {
    const combo = comboOf(row);
    if (!combo) return null;
    if (combo === 'ctrl+c') return 'Ctrl + C 是复制物品的保留快捷键，请选择其他按键。';
    const clash = HOTKEY_ROWS.find((other) => other !== row && comboOf(other) === combo);
    return clash ? `已被“${clash.label}”占用。` : null;
  };

  return (
    <Form {...form}>
      <div className="flex flex-col gap-y-4">
        <SettingsGroup title="快捷键">
          {HOTKEY_ROWS.map((row) => {
            const warning = warningFor(row);
            return (
              <FormField
                key={row.key}
                control={form.control}
                name={row.key}
                render={({ field: keyField }) => (
                  <SettingsRow
                    label={row.label}
                    description={row.description}
                    control={
                      <>
                        <FormField
                          control={form.control}
                          name={row.modifier}
                          render={({ field: modField }) => (
                            <Tabs defaultValue={'ctrl'}
                              value={modField.value as string}>
                              <TabsList className="h-8"
                                aria-label={`${row.label} 的组合修饰键`}>
                                <TabsTrigger
                                  value={'ctrl'}
                                  className="px-2.5"
                                  onClick={() => modField.onChange('ctrl')}
                                >
                                  Ctrl
                                </TabsTrigger>
                                <TabsTrigger value={'alt'}
                                  className="px-2.5"
                                  onClick={() => modField.onChange('alt')}>
                                  Alt
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          )}
                        />
                        <Plus aria-hidden
                          className="size-3.5 text-muted-foreground" />
                        <FormControl>
                          <Input
                            type="text"
                            maxLength={1}
                            placeholder={row.optional ? '-' : undefined}
                            value={(keyField.value as string | undefined)?.toUpperCase() ?? ''}
                            aria-invalid={warning ? true : undefined}
                            className={cn(
                              'h-9 w-11 rounded-md border-b-[3px] px-0 text-center font-mono text-sm font-semibold uppercase shadow-xs',
                              'focus-visible:border-b-primary',
                              warning &&
                                'aria-invalid:border-warning/80 aria-invalid:ring-warning/30 dark:aria-invalid:ring-warning/30',
                            )}
                            onChange={(e) => keyField.onChange(e.target.value.toLowerCase())}
                          />
                        </FormControl>
                      </>
                    }
                  >
                    {warning && (
                      <p role="status"
                        className="flex items-center gap-1.5 text-xs text-warning">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        {warning}
                      </p>
                    )}
                    <FormMessage />
                  </SettingsRow>
                )}
              />
            );
          })}
        </SettingsGroup>
        <SettingsHint>将估值快照或市场快捷键留空即可取消绑定。</SettingsHint>
      </div>
    </Form>
  );
}
