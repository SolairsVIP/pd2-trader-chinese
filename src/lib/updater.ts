import { isTauri } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';
import { resetUpdateNotification } from './update-preference';

export const UPDATE_RELEASES_URL = 'https://github.com/SolairsVIP/pd2-trader-chinese/releases';
export interface AvailableUpdate { version: string; notes: string; }
let pendingCheck: Promise<AvailableUpdate | null> | null = null;
let pendingInstall: Promise<boolean> | null = null;

export const isUpdateInstalling = () => pendingInstall !== null;

/** Return plain metadata and immediately release the native resource. Coalesce concurrent checks. */
export function checkForAvailableUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (pendingCheck) return pendingCheck;
  pendingCheck = (async () => {
    const update = await check({ timeout: 15000 });
    try {
      return update ? { version: update.version, notes: update.body ?? '' } : null;
    } finally {
      await update?.close();
    }
  })().finally(() => { pendingCheck = null; });
  return pendingCheck;
}

/** Called only by an explicit user click. Concurrent clicks share one installation. */
export function installUpdateAndRelaunch(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);
  if (pendingInstall) return pendingInstall;
  pendingInstall = install().finally(() => { pendingInstall = null; });
  return pendingInstall;
}

async function install(): Promise<boolean> {
  let update: Update | null = null;
  const id = toast.loading('正在检查更新…', { position: 'bottom-right', duration: Infinity });
  try {
    update = await check({ timeout: 15000 });
    if (!update) {
      toast.success('当前已是最新版本', { id, duration: 5000 });
      return false;
    }
    toast.loading('正在下载更新…', { id });
    let downloaded = 0;
    let contentLength = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') contentLength = event.data.contentLength ?? 0;
      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        const progress = contentLength ? ` ${Math.min(100, Math.floor(downloaded / contentLength * 100))}%` : '';
        toast.loading(`正在下载更新…${progress}`, { id });
      }
      if (event.event === 'Finished') toast.loading('下载完成，正在验证签名并安装…', { id });
    }, { timeout: 120000 });
    // Finished is a download event. Only a resolved installation may trigger relaunch.
    await relaunch();
    return true;
  } catch (error) {
    console.error('更新失败：', error);
    toast.error('更新失败，请稍后重试或前往 GitHub 发布页下载安装。', { id, duration: 10000 });
    resetUpdateNotification();
    return false;
  } finally {
    await update?.close().catch((error) => console.warn('释放更新资源失败：', error));
  }
}
