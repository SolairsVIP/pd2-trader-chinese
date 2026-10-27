import { useUiText } from '@/lib/ui-language';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormMessage } from '@/components/ui/form';
import React from 'react';
import { Button } from '@/components/ui/button';
import { useOptions } from '@/hooks/useOptions';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { FolderSearch, Wand2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { getSeasonSettingOptions } from '@/lib/seasons';
import { SettingsGroup, SettingsRow, SettingsSkeleton } from '../settings-ui';
import { showToast } from '@/overlay';
import { zoneText } from '@/pages/corrupted-zone/language';

const appearanceFormSchema = z.object({
  mode: z.enum(['softcore', 'hardcore'], {
    required_error: '请选择游戏模式。',
  }),
  ladder: z.enum(['non-ladder', 'ladder'], {
    required_error: '请选择天梯类型。',
  }),
  diablo2Directory: z.string().optional(),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export function GeneralForm() {
  const __ui = useUiText();
  const { settings, isLoading, updateSettings } = useOptions();
  const [detectedDirectory, setDetectedDirectory] = React.useState<string | null>(null);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  // Always call hooks at the top level
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues: {
      mode: settings?.mode || 'softcore',
      ladder: settings?.ladder || 'non-ladder',
      diablo2Directory: settings?.diablo2Directory || '',
    },
  });

  // Reset form when settings change externally
  React.useEffect(() => {
    if (settings) {
      form.reset(
        {
          mode: settings.mode || 'softcore',
          ladder: settings.ladder || 'non-ladder',
          diablo2Directory: settings.diablo2Directory || '',
        },
        { keepDirty: false },
      );
    }
  }, [settings, form]);

  // Auto-save on any change (debounced for text inputs)
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

  // Auto-detect directory on mount
  React.useEffect(() => {
    if (isTauri() && !detectedDirectory) {
      invoke<string | null>('auto_detect_diablo2_directory')
        .then((dir) => {
          if (dir) {
            setDetectedDirectory(dir);
          }
        })
        .catch(console.error);
    }
  }, [detectedDirectory]);

  if (isLoading || !settings) {
    return <SettingsSkeleton rows={4} />;
  }

  return (
    <Form {...form}>
      <div className="flex flex-col gap-y-6">
        <SettingsGroup title={zoneText('语言', settings.uiLanguage)}>
          <SettingsRow
            label={settings.uiLanguage === 'zh-TW' ? '插件介面語言' : '插件界面语言'}
            description={settings.uiLanguage === 'zh-TW'
              ? '切換插件介面的顯示語言。查價與交易大廳暫不支援繁體。'
              : '切换插件界面的显示语言。查价与交易大厅暂不支持繁体。'}
            control={
              <select
                aria-label={zoneText('界面语言', settings.uiLanguage)}
                value={settings.uiLanguage ?? 'zh-CN'}
                onChange={(e) => updateSettings({ uiLanguage: e.target.value as 'zh-CN' | 'zh-TW' })}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁體中文</option>
              </select>
            }
          />
        </SettingsGroup>
        <SettingsGroup title={__ui("游戏")}>
          <FormField
            control={form.control}
            name="ladder"
            render={({ field }) => (
              <SettingsRow
                label={__ui("天梯")}
                control={
                  <Select value={field.value}
                    onValueChange={field.onChange}
                    defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder={__ui("天梯")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ladder">{"" + __ui("天梯") + ""}</SelectItem>
                      <SelectItem value="non-ladder">{"" + __ui("非天梯") + ""}</SelectItem>
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
            name="mode"
            render={({ field }) => (
              <SettingsRow
                label={__ui("模式")}
                control={
                  <Select value={field.value}
                    onValueChange={field.onChange}
                    defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder={__ui("模式")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="softcore">{"" + __ui("普通模式") + ""}</SelectItem>
                      <SelectItem value="hardcore">{"" + __ui("专家模式") + ""}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
          <SettingsRow
            label={__ui("赛季")}
            description={__ui("按赛季筛选价格数据。查看往季价格需要有相应的历史数据。")}
            control={
              <Select
                value={settings.selectedSeasonId ?? 'current'}
                onValueChange={(value) => updateSettings({ selectedSeasonId: value })}
              >
                <FormControl>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder={__ui("赛季")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {getSeasonSettingOptions().map((option) => (
                    <SelectItem key={option.value}
                      value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Diablo II">
          <FormField
            control={form.control}
            name="diablo2Directory"
            render={({ field }) => (
              <SettingsRow
                layout="stacked"
                label={__ui("Diablo II 安装目录")}
                description={
                  detectedDirectory && !field.value ? (
                    <span className="inline-flex items-center gap-1.5">
                      <FolderSearch className="size-3.5 text-success" />
                      {`已检测到：${detectedDirectory}`}
                    </span>
                  ) : (
                    __ui("Diablo II 的安装路径。留空可自动检测。")
                  )
                }
                control={
                  <>
                    <FormControl>
                      <Input
                        placeholder="C:\Diablo II"
                        className="flex-1 font-mono text-[13px]"
                        spellCheck={false}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        if (isTauri()) {
                          try {
                            const detected = await invoke<string | null>('auto_detect_diablo2_directory');
                            if (detected) {
                              field.onChange(detected);
                              setDetectedDirectory(detected);
                            } else {
                              showToast({
                                title: '检测失败',
                                description: '无法自动检测 Diablo II 安装目录，请手动输入。',
                                variant: 'warning',
                              });
                            }
                          } catch (error) {
                            console.error('Failed to detect directory:', error);
                          }
                        }
                      }}
                    >
                      <Wand2 />
                      {" " + __ui("自动检测") + " "}</Button>
                  </>
                }
              >
                <FormMessage />
              </SettingsRow>
            )}
          />
        </SettingsGroup>

        <SettingsGroup title={__ui("故障排查")}>
          <SettingsRow
            label={__ui("调试日志")}
            description={__ui("将控制台输出写入日志文件，以便排查问题。")}
            control={
              <FormControl>
                <Switch
                  checked={settings.debugLoggingEnabled ?? false}
                  onCheckedChange={(checked) => updateSettings({ debugLoggingEnabled: checked })}
                />
              </FormControl>
            }
          />
        </SettingsGroup>
      </div>
    </Form>
  );
}
