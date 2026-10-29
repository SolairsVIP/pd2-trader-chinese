// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import ControllerPointer from './ControllerPointer';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock('@/overlay', () => ({ isKeyboardClaimed: () => true }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: () => ({ settings: {} }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function emitControllerEvent(name: string, payload: unknown) {
  for (const [event, handler] of vi.mocked(listen).mock.calls) {
    if (event === name) handler({ payload } as never);
  }
}

it('allows Xbox B to close the price check after it is released', async () => {
  const close = vi.fn();
  render(<><div data-panel-id="itemSearch" /><ControllerPointer panelId="itemSearch" close={close} /></>);
  await act(async () => {});
  act(() => emitControllerEvent('controller-xbox-price-action', 'close'));
  act(() => vi.advanceTimersByTime(120));
  expect(close).toHaveBeenCalledTimes(1);
});

it('uses Xbox A to click the item under the price-check cursor', async () => {
  const onClick = vi.fn();
  render(<><div data-panel-id="itemSearch"><button onClick={onClick}>搜索</button></div><ControllerPointer panelId="itemSearch" close={vi.fn()} /></>);
  await act(async () => {});
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(screen.getByText('搜索'));
  act(() => emitControllerEvent('controller-xbox-price-action', 'confirm'));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('does not route Xbox buttons into other panels and retains PS actions', async () => {
  const close = vi.fn();
  render(<><div data-panel-id="market" /><ControllerPointer panelId="market" close={close} /></>);
  await act(async () => {});
  act(() => emitControllerEvent('controller-xbox-price-action', 'close'));
  act(() => vi.advanceTimersByTime(120));
  expect(close).not.toHaveBeenCalled();
  act(() => emitControllerEvent('controller-menu-action', 'close'));
  act(() => vi.advanceTimersByTime(120));
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not move the cursor of another panel in response to Xbox sticks', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((frame: FrameRequestCallback) => { frames.push(frame); return frames.length; }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) });
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
  const view = render(<><div data-panel-id="market" /><ControllerPointer panelId="market" close={vi.fn()} /></>);
  await act(async () => {});
  act(() => emitControllerEvent('controller-xbox-price-stick', [255, 128, 128]));
  act(() => frames.shift()!(performance.now() + 50));
  expect(view.container.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.transform).toBe('translate(250px, 250px)');
  act(() => emitControllerEvent('controller-stick', [255, 128, 128]));
  act(() => frames.shift()!(performance.now() + 100));
  expect(view.container.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.transform).not.toBe('translate(250px, 250px)');
});

it('moves the price-check cursor with the Xbox left stick', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', vi.fn((frame: FrameRequestCallback) => { frames.push(frame); return frames.length; }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) });
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
  const view = render(<><div data-panel-id="itemSearch" /><ControllerPointer panelId="itemSearch" close={vi.fn()} /></>);
  await act(async () => {});
  act(() => emitControllerEvent('controller-xbox-price-stick', [255, 128, 128]));
  act(() => frames.shift()!(performance.now() + 50));
  expect(view.container.querySelector<HTMLElement>('[aria-hidden="true"]')?.style.transform).not.toBe('translate(250px, 250px)');
});

it('lets Xbox B dismiss an open price-check popup before closing the panel', async () => {
  const close = vi.fn();
  const onEscape = vi.fn();
  render(<><div data-panel-id="itemSearch"><div role="dialog" data-state="open" onKeyDown={onEscape} /></div><ControllerPointer panelId="itemSearch" close={close} /></>);
  await act(async () => {});
  act(() => emitControllerEvent('controller-xbox-price-action', 'close'));
  act(() => vi.advanceTimersByTime(120));
  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
