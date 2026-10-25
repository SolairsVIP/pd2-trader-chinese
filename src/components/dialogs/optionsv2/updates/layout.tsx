import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useOptions } from '@/hooks/useOptions';
import { useUpdater } from '@/hooks/useUpdater';
import { getVersion } from '@/lib/browser-app';
import { openUrl } from '@/lib/browser-opener';
import { UPDATE_RELEASES_URL, type AvailableUpdate } from '@/lib/updater';
import { Form, FormControl, FormField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsHint, SettingsRow, SettingsSection, SettingsSkeleton } from '../settings-ui';

export default function SettingsUpdates() {
  const { settings, isLoading, updateSettings } = useOptions();
  const { checkForUpdates, downloadUpdate, isUpdating } = useUpdater();
  const [version, setVersion] = useState('…');
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('可随时手动检查更新。');
  const busy = useRef(false);
  const mounted = useRef(true);
  const form = useForm({ defaultValues: { autoUpdateEnabled: settings.autoUpdateEnabled ?? true } });

  useEffect(() => {
    mounted.current = true;
    getVersion().then((v) => { if (mounted.current) setVersion(v); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { form.reset({ autoUpdateEnabled: settings.autoUpdateEnabled ?? true }); }, [settings.autoUpdateEnabled, form]);

  const checkNow = async () => {
    if (busy.current || isUpdating) return;
    busy.current = true;
    setChecking(true);
    setStatus('正在检查中文版更新…');
    setAvailable(null);
    try {
      const update = await checkForUpdates();
      if (!mounted.current) return;
      setAvailable(update);
      setStatus(update ? `发现新版本 ${update.version}` : '当前已是最新版本。');
    } catch {
      if (mounted.current) setStatus('检查失败，请检查网络后重试，或打开 GitHub 发布页。');
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  };

  if (isLoading) return <SettingsSkeleton rows={2} />;
  return (
    <SettingsSection title="更新" description="从中文版 GitHub 仓库获取经过签名验证的更新。">
      <Form {...form}>
        <SettingsGroup>
          <FormField control={form.control} name="autoUpdateEnabled" render={({ field }) => (
            <SettingsRow label="自动检查更新" description="默认开启。启动后及每隔 30 分钟检查一次；只提示，点击安装后才下载并重启查价器。"
              control={<FormControl><Switch checked={field.value} onCheckedChange={(value) => {
                field.onChange(value);
                void updateSettings({ autoUpdateEnabled: value, autoUpdatePreferenceVersion: 1 });
              }} /></FormControl>} />
          )} />
        </SettingsGroup>
      </Form>
      <SettingsGroup title={`当前版本：${version}`}>
        <div className="space-y-4 p-4">
          <p role="status" aria-live="polite" className="text-sm">{status}</p>
          {available && <div className="space-y-2">
            <p className="font-semibold text-primary">新版 {available.version}</p>
            <p className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">{available.notes || '更新说明请查看发布页。'}</p>
            <p className="text-sm">安装会关闭并重启查价器，请先完成当前操作。</p>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void checkNow()} disabled={checking || isUpdating}>{checking ? '正在检查…' : '检查更新'}</Button>
            {available && <Button disabled={checking || isUpdating} onClick={() => void downloadUpdate()}>{isUpdating ? '正在更新…' : '下载并安装'}</Button>}
            <Button variant="outline" onClick={() => void openUrl(UPDATE_RELEASES_URL)}>GitHub 发布页</Button>
          </div>
        </div>
      </SettingsGroup>
      <SettingsHint>关闭自动检查后仍可手动检查。旧版本需先手动安装一次 0.11.2 或更高版本，之后即可收到新版提示。网络不可用时保持当前版本。</SettingsHint>
    </SettingsSection>
  );
}
