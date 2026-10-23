import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOptions } from '@/hooks/useOptions';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePd2Website } from '@/hooks/pd2website/usePD2Website';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, LogOut, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { fadeInUp } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SettingsGroup, SettingsRow } from '../settings-ui';

const accountFormSchema = z.object({
  account: z.string().optional(),
  pd2Token: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

export function AccountForm() {
  const { settings, updateSettings } = useOptions();
  const { authData, logout, startOAuthFlow } = usePd2Website();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      account: settings?.account || '',
      pd2Token: settings?.pd2Token || '',
    },
  });

  // Update form when settings change externally
  useEffect(() => {
    if (settings) {
      form.reset(
        {
          account: settings.account || '',
          pd2Token: settings.pd2Token || '',
        },
        { keepDirty: false },
      );
    }
  }, [settings, form]);

  // Auto-save on any change
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    const subscription = form.watch((values) => {
      const current = settingsRef.current;
      if (values.account === current?.account && values.pd2Token === current?.pd2Token) return;
      const updates: any = { account: values.account };
      if (values.pd2Token && values.pd2Token !== current?.pd2Token) {
        updates.pd2Token = values.pd2Token;
      }
      updateSettings(updates);
    });
    return () => subscription.unsubscribe();
  }, [form, updateSettings]);

  useEffect(() => {
    if (authData?.user?.game?.accounts) {
      setAccounts(authData.user.game.accounts);
    } else {
      setAccounts([]);
    }
  }, [authData]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      await startOAuthFlow();
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
    } finally {
      setLoggingIn(false);
    }
  };

  const username = authData?.user?.username;

  return (
    <Form {...form}>
      <div className="flex flex-col gap-y-6">
        <AnimatePresence initial={false}>
          {accounts.length === 0 && (
            <motion.div key="no-accounts"
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              exit="exit">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>没有可用的账户</AlertTitle>
                <AlertDescription>
                  如果未选择正确的账户，上架物品时可能会遇到 404 错误。
                  请先验证身份以加载账户。
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        <SettingsGroup
          title="PD2 账户"
          aside={
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium',
                authData ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <span
                aria-hidden
                className={cn('size-1.5 rounded-full', authData ? 'bg-success shadow-glow' : 'bg-muted-foreground/50')}
              />
              {authData ? (username ? `已登录：${username}` : '已登录') : '未登录'}
            </span>
          }
        >
          {!isTauri() && (
            <FormField
              control={form.control}
              name="pd2Token"
              render={({ field }) => (
                <SettingsRow
                  layout="stacked"
                  label="PD2 令牌"
                  description={
                    <>
                      从以下网址获取令牌：{' '}
                      <a
                        href="https://projectdiablo2.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        projectdiablo2.com
                        <ExternalLink className="w-3 h-3" />
                      </a>{' '}
                      登录后，在浏览器的 localStorage 中查找 &apos;pd2-token&apos;。
                    </>
                  }
                  control={
                    <FormControl>
                      <Input type="password"
                        placeholder="输入 PD2 令牌"
                        className="w-full"
                        autoComplete="off"
                        {...field} />
                    </FormControl>
                  }
                >
                  <FormMessage />
                </SettingsRow>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="account"
            render={({ field }) => (
              <SettingsRow
                label="账户"
                description={
                  accounts.length > 0
                    ? `已关联 ${accounts.length} 个游戏账户，用于上架物品和交易报价。`
                    : '登录以加载关联到 PD2 个人资料的游戏账户。'
                }
                control={
                  <>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={accounts.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder={accounts.length === 0 ? '请先验证身份' : '选择账户'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((acc: string) => (
                          <SelectItem key={acc}
                            value={acc}>
                            {acc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {authData ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="min-w-28"
                      >
                        {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                        {loggingOut ? '正在退出…' : '退出登录'}
                      </Button>
                    ) : (
                      <Button type="button"
                        onClick={handleLogin}
                        disabled={loggingIn}
                        className="min-w-28">
                        {loggingIn ? <Loader2 className="animate-spin" /> : <LogIn />}
                        {loggingIn ? '正在登录…' : '登录'}
                      </Button>
                    )}
                  </>
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
