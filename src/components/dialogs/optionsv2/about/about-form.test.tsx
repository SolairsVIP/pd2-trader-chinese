// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { isTauri } from '@tauri-apps/api/core';
import { useOptions } from '@/hooks/useOptions';
import type { ISettings } from '@/hooks/useOptions';
import { getVersion } from '@/lib/browser-app';
import { useUpdater } from '@/hooks/useUpdater';
import { useOverlay } from '@/overlay';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import { AboutForm } from './about-form';
import SettingsUpdates from '../updates/layout';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn() }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/lib/browser-app', () => ({ getVersion: vi.fn() }));
vi.mock('@/hooks/useUpdater', () => ({ useUpdater: vi.fn() }));
vi.mock('@/overlay', () => ({ useOverlay: vi.fn() }));
vi.mock('@/lib/browser-opener', () => ({ openUrl: vi.fn() }));

const openPanel = vi.fn();

let store: OptionsStore;
const checkForUpdates = vi.fn();
const downloadUpdate = vi.fn();

async function renderForm(settings: Partial<ISettings> = { autoUpdateEnabled: true }, isLoading = false) {
  store = createOptionsStore(settings, isLoading);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  render(<AboutForm />);
  await act(async () => {});
}

// Update controls now live in their own section; keep testing their behavior at the new entry point.
async function renderUpdates(settings: Partial<ISettings> = { autoUpdateEnabled: true }) {
  store = createOptionsStore(settings);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  render(<SettingsUpdates />);
  await act(async () => {});
}

const click = (name: RegExp | string) => act(async () => fireEvent.click(screen.getByRole('button', { name })));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(getVersion).mockResolvedValue('1.4.0');
  vi.mocked(useOverlay).mockReturnValue({ openPanel } as never);
  checkForUpdates.mockReset();
  downloadUpdate.mockReset();
  vi.mocked(useUpdater).mockReturnValue({ checkForUpdates, downloadUpdate, isUpdating: false } as never);
});

afterEach(cleanup);

describe('AboutForm', () => {
  it('shows a skeleton while settings load', async () => {
    await renderForm({}, true);
    expect(screen.queryByText('PD2 Trader 中文版')).toBeNull();
  });

  it('shows the running version', async () => {
    await renderForm();
    expect(screen.queryByText('版本：1.4.0')).not.toBeNull();
  });

  it('offers the update returned by a manual check and installs that update', async () => {
    const update = { version: '1.5.0' };
    checkForUpdates.mockResolvedValue(update);
    await renderUpdates();
    expect(screen.queryByText('可随时手动检查更新。')).not.toBeNull();

    await click(/检查更新/);
    expect(screen.queryByText('发现新版本 1.5.0')).not.toBeNull();
    expect(screen.queryByText('新版 1.5.0')).not.toBeNull();

    await click(/下载并安装/);
    expect(downloadUpdate).toHaveBeenCalledWith();
  });

  it('stays on "latest" when the check finds nothing', async () => {
    checkForUpdates.mockResolvedValue(null);
    await renderUpdates();
    await click(/检查更新/);
    expect(screen.queryByText('当前已是最新版本。')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /下载并安装/ })).toBeNull();
  });

  it('disables the check button while checking and re-enables it after a failure', async () => {
    const { promise, reject } = Promise.withResolvers<unknown>();
    checkForUpdates.mockReturnValue(promise);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderUpdates();

    await click(/检查更新/);
    expect((screen.getByRole('button', { name: /正在检查/ }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => reject(new Error('offline')));
    expect((screen.getByRole('button', { name: /检查更新/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/检查失败/)).not.toBeNull();
  });

  it('toggles automatic updates', async () => {
    await renderUpdates({ autoUpdateEnabled: true });
    fireEvent.click(screen.getByRole('switch', { name: '自动检查更新' }));
    expect(store.updateSettings).toHaveBeenCalledWith({ autoUpdateEnabled: false, autoUpdatePreferenceVersion: 1 });
    expect(screen.getByRole('switch', { name: '自动检查更新' }).getAttribute('aria-checked')).toBe('false');
  });

  it('treats an unset auto-update preference as on', async () => {
    await renderUpdates({});
    expect(screen.getByRole('switch', { name: '自动检查更新' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens the changelog panel', async () => {
    await renderForm();
    await click(/查看更新日志/);
    expect(openPanel).toHaveBeenCalledWith('changeLog');
  });

  it('in the browser hides update controls and opens the changelog directly', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await renderForm();
    expect(screen.queryByRole('button', { name: /检查更新/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: '自动检查更新' })).toBeNull();
    await click(/查看更新日志/);
    expect(openPanel).toHaveBeenCalledWith('changeLog');
  });
});
