// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import { checkForAvailableUpdate, installUpdateAndRelaunch } from '@/lib/updater';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import SettingsUpdates from './layout';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/lib/updater', () => ({
  checkForAvailableUpdate: vi.fn(), installUpdateAndRelaunch: vi.fn(),
  UPDATE_RELEASES_URL: 'https://github.com/SolairsVIP/pd2-trader-chinese/releases',
}));
vi.mock('@/lib/browser-app', () => ({ getVersion: async () => '0.11.2' }));
vi.mock('@/lib/browser-opener', () => ({ openUrl: vi.fn() }));
let store: OptionsStore;
beforeEach(() => {
  vi.clearAllMocks();
  store = createOptionsStore({ autoUpdateEnabled: false, autoUpdatePreferenceVersion: 1 });
  vi.mocked(useOptions).mockImplementation(store.useOptions);
});
afterEach(cleanup);
const click = (label: string) => act(async () => { fireEvent.click(screen.getByRole('button', { name: label })); });

it('manual check works while automatic checks are off; install requires another click', async () => {
  vi.mocked(checkForAvailableUpdate).mockResolvedValue({ version: '0.11.3', notes: '<script>plain text</script>' });
  await act(async () => { render(<SettingsUpdates />); });
  expect(checkForAvailableUpdate).not.toHaveBeenCalled();
  await click('检查更新');
  expect(screen.getByText('<script>plain text</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  expect(installUpdateAndRelaunch).not.toHaveBeenCalled();
  await click('下载并安装');
  expect(installUpdateAndRelaunch).toHaveBeenCalledTimes(1);
});
it('shows an explicit retry message when GitHub cannot be reached', async () => {
  vi.mocked(checkForAvailableUpdate).mockRejectedValue(new Error('offline'));
  await act(async () => { render(<SettingsUpdates />); });
  await click('检查更新');
  expect(screen.getByRole('status').textContent).toContain('检查失败');
  expect(installUpdateAndRelaunch).not.toHaveBeenCalled();
});
it('persists an explicit opt-out with the migration marker', async () => {
  store.replace({ autoUpdateEnabled: true, autoUpdatePreferenceVersion: 1 });
  await act(async () => { render(<SettingsUpdates />); });
  await act(async () => { fireEvent.click(screen.getByRole('switch')); });
  expect(store.updateSettings).toHaveBeenCalledWith({ autoUpdateEnabled: false, autoUpdatePreferenceVersion: 1 });
});
