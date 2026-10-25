// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useOptions, type ISettings } from './useOptions';
import { showToast } from '@/overlay';
import { resetUpdateNotification, useAppUpdates } from './useAppUpdates';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@/overlay', () => ({ showToast: vi.fn() }));
vi.mock('./useOptions', () => ({ useOptions: vi.fn() }));
let enabled: boolean | undefined;
let loading: boolean;
let update: any;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); resetUpdateNotification(); enabled = true; loading = false;
  update = { version: '1.2.0', body: '说明', close: vi.fn(async () => {}), downloadAndInstall: vi.fn() };
  vi.mocked(check).mockResolvedValue(update);
  vi.mocked(useOptions).mockImplementation(() => ({ settings: { autoUpdateEnabled: enabled } as ISettings, isLoading: loading }) as any);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it.each([true, undefined])('enabled=%s only notifies, never downloads or restarts', async (value) => {
  enabled = value; renderHook(useAppUpdates);
  await advance(4999); expect(check).not.toHaveBeenCalled();
  await advance(1); expect(showToast).toHaveBeenCalledTimes(1);
  expect(update.close).toHaveBeenCalledTimes(1);
  expect(update.downloadAndInstall).not.toHaveBeenCalled(); expect(relaunch).not.toHaveBeenCalled();
  await advance(30 * 60 * 1000); expect(showToast).toHaveBeenCalledTimes(1);
});
it('does not check while disabled or loading; enabling starts checks', async () => {
  enabled = false; const view = renderHook(useAppUpdates);
  await advance(60 * 60 * 1000); expect(check).not.toHaveBeenCalled();
  enabled = true; loading = true; view.rerender();
  await advance(10000); expect(check).not.toHaveBeenCalled();
  loading = false; view.rerender(); await advance(5000); expect(showToast).toHaveBeenCalledTimes(1);
});
it('ignores a pending check after disabling', async () => {
  let resolve!: (value: any) => void;
  vi.mocked(check).mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const view = renderHook(useAppUpdates); await advance(5000);
  enabled = false; view.rerender();
  await act(async () => resolve(update));
  expect(showToast).not.toHaveBeenCalled(); expect(update.close).toHaveBeenCalledTimes(1);
});
it('retries a failed check and notifies a later version', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(check).mockRejectedValueOnce(new Error('offline'));
  renderHook(useAppUpdates); await advance(5000); expect(showToast).not.toHaveBeenCalled();
  await advance(30 * 60 * 1000); expect(showToast).toHaveBeenCalledTimes(1);
  vi.mocked(check).mockResolvedValue({ ...update, version: '1.3.0' });
  await advance(30 * 60 * 1000); expect(showToast).toHaveBeenCalledTimes(2);
});
it('cleans up scheduled checks on unmount', async () => {
  const view = renderHook(useAppUpdates); view.unmount(); await advance(60 * 60 * 1000);
  expect(check).not.toHaveBeenCalled();
});
