// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { requestRegionSync, syncRegionBeforeFocus, useRegionSync } from './region';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }));
let box: DOMRect;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  document.body.innerHTML = '<div data-interactive="true"></div>';
  box = { left: 100, top: 100, right: 140, bottom: 210, width: 40, height: 110 } as DOMRect;
  document.body.firstElementChild!.getBoundingClientRect = () => box;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const frame = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(16);
  });

describe('native small-window region delivery', () => {
  it('holds focus until the native host acknowledges the latest panel size', async () => {
    let finish!: () => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(useRegionSync);
    await frame();
    box = { ...box, left: 50, width: 90 };
    const focused = vi.fn();
    const waiting = syncRegionBeforeFocus().then(focused);
    await frame();
    expect(focused).not.toHaveBeenCalled();
    await act(async () => finish());
    await frame();
    await waiting;
    expect(focused).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenLastCalledWith('set_interactive_region', {
      rects: [{ x: 46, y: 96, width: 98, height: 118 }],
    });
  });

  it('rejects pending focus when the overlay is disposed', async () => {
    let finish!: () => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderHook(useRegionSync);
    await frame();
    const rejected = expect(syncRegionBeforeFocus()).rejects.toThrow('stopped');
    view.unmount();
    await rejected;
    await act(async () => finish());
  });
  it('restores a hidden host even when WebView does not deliver animation frames', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 100),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    box = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
    renderHook(useRegionSync);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(invoke).toHaveBeenCalledWith('set_interactive_region', { rects: [] });
    box = { left: 100, top: 100, right: 140, bottom: 210, width: 40, height: 110 } as DOMRect;
    requestRegionSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(invoke).toHaveBeenLastCalledWith('set_interactive_region', {
      rects: [{ x: 96, y: 96, width: 48, height: 118 }],
    });
  });

  it('serializes native updates and sends the latest size after an earlier request finishes', async () => {
    let finish!: () => void;
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(useRegionSync);
    await frame();
    expect(invoke).toHaveBeenCalledTimes(1);
    box = { ...box, left: 50, width: 90 };
    requestRegionSync();
    await frame();
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await frame();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith('set_interactive_region', {
      rects: [{ x: 46, y: 96, width: 98, height: 118 }],
    });
  });

  it('retries a transient failure even when no further DOM changes occur', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error('temporary native failure'));
    renderHook(useRegionSync);
    await frame();
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(116);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
