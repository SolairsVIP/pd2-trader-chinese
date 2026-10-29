// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BaseDirectory, readTextFile, writeTextFile } from '@/lib/browser-fs';
import { OptionsProvider, useOptions } from '@/hooks/useOptions';
import { OverlayProvider, OverlayRoot, useOverlay, type PanelDefs } from '@/overlay';
import CorruptedZoneController from '@/pages/corrupted-zone/CorruptedZoneController';
import CorruptedZonePage from '@/pages/corrupted-zone/CorruptedZonePage';
import ControllerMenu from './ControllerMenu';

// Native overlay input-region operations are unavailable in the browser test environment.
vi.mock('@/overlay/region', () => ({
  useRegionSync: () => {},
  holdRegionLoop: () => () => {},
  syncRegionBeforeFocus: async () => {},
}));
vi.mock('@/components/dialogs/optionsv2/options-layout', () => ({ default: () => null }));
vi.mock('@/lib/debug-logger', () => ({ startDebugLogging: () => {}, stopDebugLogging: () => {} }));

const defs = {
  controllerMenu: {
    id: 'controllerMenu',
    component: ControllerMenu,
    size: { width: 420, height: 340 },
    resizable: false,
    placement: 'gameCenter',
    persist: false,
    keyboard: 'onPointerDown',
    keepMounted: false,
    hideOnGameBlur: true,
  },
  corruptedZone: {
    id: 'corruptedZone',
    component: CorruptedZonePage,
    size: { width: 720, height: 48 },
    resizable: false,
    placement: { x: 0, y: 8 },
    persist: false,
    keyboard: 'never',
    keepMounted: true,
    hideOnGameBlur: true,
  },
} as unknown as PanelDefs; // This integration fixture mounts only the two panels it exercises.

function MenuLauncher() {
  const { isLoading } = useOptions();
  const { openPanel } = useOverlay();
  return <button disabled={isLoading} onClick={() => openPanel('controllerMenu')}>打开手柄菜单</button>;
}

function mount() {
  return render(
    <OptionsProvider>
      <OverlayProvider defs={defs}>
        <CorruptedZoneController />
        <MenuLauncher />
        <OverlayRoot />
      </OverlayProvider>
    </OptionsProvider>,
  );
}

async function savedEnabled(): Promise<boolean> {
  const contents = await readTextFile('settings.json', { baseDir: BaseDirectory.AppConfig });
  return JSON.parse(contents).corruptedZoneEnabled;
}

beforeEach(async () => {
  localStorage.clear();
  let chain: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, cb: () => Promise<unknown>) => {
        const run = chain.then(cb);
        chain = run.catch(() => {});
        return run;
      },
    },
  });
  await writeTextFile('settings.json', JSON.stringify({ corruptedZoneEnabled: false }), {
    baseDir: BaseDirectory.AppConfig,
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('persists the controller-menu opt-in, restores the notice on restart, and can hide it again', async () => {
  const first = mount();
  await waitFor(() => expect((screen.getByRole('button', { name: '打开手柄菜单' }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole('button', { name: '隐藏腐化区提示' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '打开手柄菜单' }));
  fireEvent.click(screen.getByRole('button', { name: '腐化区提示' }));
  expect(screen.getByRole('button', { name: '隐藏腐化区提示' })).not.toBeNull();
  await waitFor(async () => expect(await savedEnabled()).toBe(true));

  fireEvent.click(screen.getByRole('button', { name: '隐藏腐化区提示' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '隐藏腐化区提示' })).toBeNull());
  expect(await savedEnabled()).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: '打开手柄菜单' }));
  fireEvent.click(screen.getByRole('button', { name: '腐化区提示' }));
  await waitFor(async () => expect(await savedEnabled()).toBe(true));
  expect(screen.getByRole('button', { name: '隐藏腐化区提示' })).not.toBeNull();

  first.unmount();
  const restarted = mount();
  expect(await screen.findByRole('button', { name: '隐藏腐化区提示' })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '隐藏腐化区提示' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '隐藏腐化区提示' })).toBeNull());
  expect(await savedEnabled()).toBe(false);

  restarted.unmount();
  mount();
  await waitFor(() => expect((screen.getByRole('button', { name: '打开手柄菜单' }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByRole('button', { name: '隐藏腐化区提示' })).toBeNull();
});
