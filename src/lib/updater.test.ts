// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';
import { checkForAvailableUpdate, installUpdateAndRelaunch } from './updater';
import { migrateUpdatePreference, resetUpdateNotification, shouldNotifyUpdate } from './update-preference';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));
let order: string[];
let update: any;
beforeEach(() => {
  vi.clearAllMocks(); order = []; resetUpdateNotification();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  update = { version: '1.2.0', body: '更新说明', close: vi.fn(async () => {}), downloadAndInstall: vi.fn(async (onEvent) => {
    onEvent({ event: 'Finished' }); order.push('install');
  }) };
  vi.mocked(check).mockResolvedValue(update);
  vi.mocked(relaunch).mockImplementation(async () => { order.push('relaunch'); });
});
it('coalesces checks and closes the native resource without downloading', async () => {
  const a = checkForAvailableUpdate(), b = checkForAvailableUpdate();
  expect(a).toBe(b); expect(await a).toEqual({ version: '1.2.0', notes: '更新说明' });
  expect(update.close).toHaveBeenCalledTimes(1); expect(update.downloadAndInstall).not.toHaveBeenCalled();
});
it('only explicit install performs download, installation then relaunch', async () => {
  expect(await installUpdateAndRelaunch()).toBe(true); expect(order).toEqual(['install', 'relaunch']);
  expect(update.close).toHaveBeenCalledTimes(1);
});
it('no available update never restarts', async () => {
  vi.mocked(check).mockResolvedValue(null);
  expect(await installUpdateAndRelaunch()).toBe(false); expect(relaunch).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith('当前已是最新版本', expect.anything());
});
it.each(['network', 'signature', 'installer'])('%s failure after download never restarts and permits retry', async () => {
  shouldNotifyUpdate('1.2.0');
  update.downloadAndInstall.mockImplementationOnce(async (onEvent: any) => { onEvent({ event: 'Finished' }); throw new Error('failed'); });
  expect(await installUpdateAndRelaunch()).toBe(false); expect(relaunch).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled(); expect(shouldNotifyUpdate('1.2.0')).toBe(true);
  expect(await installUpdateAndRelaunch()).toBe(true);
});
it('a check failure never restarts', async () => {
  vi.mocked(check).mockRejectedValueOnce(new Error('offline'));
  expect(await installUpdateAndRelaunch()).toBe(false); expect(relaunch).not.toHaveBeenCalled();
});
it('repeated install clicks share one download', async () => {
  const a = installUpdateAndRelaunch(), b = installUpdateAndRelaunch();
  expect(a).toBe(b); await Promise.all([a,b]); expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
});
it('migrates old forced-off settings once and preserves a later explicit opt-out', () => {
  expect(migrateUpdatePreference({ autoUpdateEnabled: false }, { autoUpdateEnabled: false })).toMatchObject({ autoUpdateEnabled: true, autoUpdatePreferenceVersion: 1 });
  expect(migrateUpdatePreference({ autoUpdateEnabled: false, autoUpdatePreferenceVersion: 1 }, { autoUpdateEnabled: false })).toEqual({ autoUpdateEnabled: false });
});
