import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useOptions } from './useOptions';
import { ToastActionType } from '@/common/types/Events';
import { showToast } from '@/overlay';
import { checkForAvailableUpdate, isUpdateInstalling } from '@/lib/updater';
import { shouldNotifyUpdate } from '@/lib/update-preference';

export { resetUpdateNotification } from '@/lib/update-preference';

// Only AppController mounts this hook. Checking never downloads or restarts the app.
export const useAppUpdates = () => {
  const { settings, isLoading } = useOptions();
  const enabled = settings.autoUpdateEnabled ?? true;
  useEffect(() => {
    if (!isTauri() || isLoading || !enabled) return;
    let cancelled = false;
    const checkAndNotify = async () => {
      if (cancelled || isUpdateInstalling()) return;
      try {
        const update = await checkForAvailableUpdate();
        if (cancelled || !update || !shouldNotifyUpdate(update.version)) return;
        showToast({
          title: `PD2 Trader 中文版 ${update.version} 可用`,
          description: '点击后下载、安装并重启查价器。可以稍后在“设置 → 更新”中安装。',
          duration: 30000,
          action: { label: '下载并安装', type: ToastActionType.UPDATE_AVAILABLE },
        });
      } catch (error) {
        console.warn('检查更新失败，稍后自动重试：', error);
      }
    };
    const initial = setTimeout(() => void checkAndNotify(), 5000);
    const interval = setInterval(() => void checkAndNotify(), 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [isLoading, enabled]);
};
