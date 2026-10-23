import React from 'react';
import { useForm } from 'react-hook-form';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';
import { Form, FormControl, FormField } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOptions } from '@/hooks/useOptions';
import { getProfileSettings, NetWorthApiError, ProfileSettings, updateProfileSettings } from '@/lib/networth-api';
import { BACKEND_URL } from '@/lib/pkce';
import { openUrl } from '@/lib/browser-opener';
import { SettingsGroup, SettingsRow } from '../settings-ui';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-live' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

type ProfileFormValues = { optedIn: boolean; displayName: string; showHoldings: boolean };

const toValues = (p: ProfileSettings): ProfileFormValues => ({
  optedIn: p.optedIn,
  displayName: p.displayName ?? p.displayNameOptions[0] ?? '',
  showHoldings: p.showHoldings,
});

/**
 * Leaderboard visibility, stored server-side per PD2 login (not in local settings).
 * Every change is saved immediately; on failure the controls snap back to the server state.
 */
export function PublicProfileGroup() {
  const { settings } = useOptions();
  const token = settings?.pd2Token ?? null;
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' });
  const [profile, setProfile] = React.useState<ProfileSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const form = useForm<ProfileFormValues>({ defaultValues: { optedIn: false, displayName: '', showHoldings: false } });

  const load = React.useCallback(async () => {
    if (!token) {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const p = await getProfileSettings(token);
      setProfile(p);
      form.reset(toValues(p));
      setState({ kind: 'ready' });
    } catch (err) {
      if (err instanceof NetWorthApiError && err.status === 404) setState({ kind: 'not-live' });
      else if (err instanceof NetWorthApiError && err.status === 401) setState({ kind: 'signed-out' });
      else setState({ kind: 'error', message: err instanceof Error ? err.message : '无法加载个人资料设置。' });
    }
  }, [token, form]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<ProfileFormValues>) => {
    if (!token) return;
    const next = { ...form.getValues(), ...patch };
    form.reset(next);
    setSaving(true);
    setSaveError(null);
    try {
      const p = await updateProfileSettings(token, {
        optedIn: next.optedIn,
        showHoldings: next.showHoldings,
        displayName: next.displayName || undefined,
      });
      setProfile(p);
      form.reset(toValues(p));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败。');
      if (profile) form.reset(toValues(profile));
    } finally {
      setSaving(false);
    }
  };

  const optedIn = form.watch('optedIn');
  const ready = state.kind === 'ready';
  const status =
    state.kind === 'loading' ? (
      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    ) : saving ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        正在保存
      </span>
    ) : null;

  const description = (() => {
    switch (state.kind) {
      case 'signed-out':
        return '登录 PD2 账号后，可选择是否在排行榜中公开显示。';
      case 'not-live':
        return '排行榜将于第 14 赛季开放。开放后，你可以选择公开个人资料。';
      case 'error':
        return state.message;
      default:
        return '在 pd2trader.com 排行榜和公开个人资料页展示仓库估值。默认关闭；你的历史记录仅自己可见。';
    }
  })();

  return (
    <Form {...form}>
      <SettingsGroup title="排行榜"
        aside={status}>
        <FormField
          control={form.control}
          name="optedIn"
          render={({ field }) => (
            <SettingsRow
              label="公开个人资料"
              description={description}
              disabled={!ready}
              control={
                state.kind === 'error' ? (
                  <Button type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={load}>
                    <RotateCw className="size-3.5" />
                    重试
                  </Button>
                ) : (
                  <FormControl>
                    <Switch
                      checked={field.value}
                      disabled={!ready || saving}
                      onCheckedChange={(checked) => save({ optedIn: checked })}
                    />
                  </FormControl>
                )
              }
            >
              {saveError && <p className="text-xs font-medium text-destructive">{saveError}</p>}
            </SettingsRow>
          )}
        />
        {ready && optedIn && profile && (
          <>
            {profile.displayNameOptions.length > 1 && (
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <SettingsRow
                    label="显示名称"
                    description="选择用于个人资料名称的游戏账号。"
                    control={
                      <Select
                        value={field.value}
                        disabled={saving}
                        onValueChange={(value) => save({ displayName: value })}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="账号" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {profile.displayNameOptions.map((name) => (
                            <SelectItem key={name}
                              value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                )}
              />
            )}
            <FormField
              control={form.control}
              name="showHoldings"
              render={({ field }) => (
                <SettingsRow
                  label="显示仓库物品"
                  description="同时在个人资料中展示高价值物品及各类别估值占比。"
                  control={
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={saving}
                        onCheckedChange={(checked) => save({ showHoldings: checked })}
                      />
                    </FormControl>
                  }
                />
              )}
            />
            {profile.slug && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="truncate text-xs text-muted-foreground">
                  pd2trader.com/u/<span className="text-foreground">{profile.slug}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => openUrl(`${BACKEND_URL}/u/${encodeURIComponent(profile.slug!)}`)}
                >
                  <ExternalLink className="size-3.5" />
                  查看个人资料
                </Button>
              </div>
            )}
          </>
        )}
      </SettingsGroup>
    </Form>
  );
}
