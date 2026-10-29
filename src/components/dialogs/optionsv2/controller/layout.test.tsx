// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseDirectory, readTextFile, writeTextFile } from '@/lib/browser-fs';
import { OptionsProvider, useOptions } from '@/hooks/useOptions';
import { clickControllerPointer, moveControllerPointer } from '@/pages/price-check/controller-pointer';
import SettingsController from './layout';

// These services are unrelated to the settings and pointer behavior exercised here.
vi.mock('@/components/dialogs/optionsv2/options-layout', () => ({ default: () => null }));
vi.mock('@/lib/debug-logger', () => ({ startDebugLogging: () => {}, stopDebugLogging: () => {} }));

function SpeedProbe() {
  const { settings } = useOptions();
  const position = moveControllerPointer(
    { x: 100, y: 100 }, [255, 128], 0.1,
    { left: 0, top: 0, right: 1000, bottom: 1000 }, settings.controllerPointerSpeed,
  );
  return <output data-testid="pointer-position">{position.x}</output>;
}

function mount() {
  return render(
    <OptionsProvider>
      <div data-testid="panel"><SettingsController /><SpeedProbe /></div>
    </OptionsProvider>,
  );
}

async function savedSpeed() {
  return JSON.parse(await readTextFile('settings.json', { baseDir: BaseDirectory.AppConfig })).controllerPointerSpeed;
}

async function sliderParts() {
  const thumb = screen.getByRole('slider', { name: '手柄光标速度' });
  const root = thumb.closest<HTMLElement>('[aria-disabled]')!;
  await waitFor(() => expect(root.getAttribute('aria-disabled')).toBe('false'));
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 300, top: 0, bottom: 20, width: 200, height: 20 } as DOMRect);
  return { thumb, root, track: root.firstElementChild! };
}

beforeEach(async () => {
  localStorage.clear();
  let chain: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, cb: () => Promise<unknown>) => {
      const run = chain.then(cb);
      chain = run.catch(() => {});
      return run;
    } },
  });
  await writeTextFile('settings.json', JSON.stringify({ controllerPointerSpeed: 100 }), { baseDir: BaseDirectory.AppConfig });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('controller pointer speed slider', () => {
  it.each(['unavailable', 'throws'] as const)(
    'applies and persists a controller selection when pointer capture is %s, including after restart',
    async (captureMode) => {
      // A synthetic PointerEvent cannot make the mouse pointer active; WebView may ignore capture or throw.
      const capture = vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
        if (captureMode === 'throws') throw new DOMException('The pointer is not active', 'NotFoundError');
      });
      vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(false);
      const first = mount();
      const { thumb, track } = await sliderParts();
      const panel = screen.getByTestId('panel');
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(track);

      act(() => clickControllerPointer(panel, { x: 220, y: 10 }));
      await waitFor(async () => expect(await savedSpeed()).toBe(140));
      expect(thumb.getAttribute('aria-valuenow')).toBe('140');
      expect(Number(screen.getByTestId('pointer-position').textContent)).toBeCloseTo(198);
      expect(capture).not.toHaveBeenCalled();

      first.unmount();
      mount();
      await sliderParts();
      expect(screen.getByRole('slider', { name: '手柄光标速度' }).getAttribute('aria-valuenow')).toBe('140');
      expect(Number(screen.getByTestId('pointer-position').textContent)).toBeCloseTo(198);
    },
  );

  it('snaps controller selections at both ends and supports keyboard adjustment after selection', async () => {
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('The pointer is not active', 'NotFoundError');
    });
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockReturnValue(false);
    mount();
    const { thumb, track } = await sliderParts();
    const panel = screen.getByTestId('panel');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(track);

    act(() => clickControllerPointer(panel, { x: 104, y: 10 }));
    await waitFor(async () => expect(await savedSpeed()).toBe(50));
    expect(thumb.getAttribute('aria-valuenow')).toBe('50');
    expect(document.activeElement).toBe(thumb);

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    await waitFor(async () => expect(await savedSpeed()).toBe(60));
    expect(thumb.getAttribute('aria-valuenow')).toBe('60');

    act(() => clickControllerPointer(panel, { x: 296, y: 10 }));
    await waitFor(async () => expect(await savedSpeed()).toBe(200));
    expect(thumb.getAttribute('aria-valuenow')).toBe('200');
  });

  it('does not change a disabled slider while settings are loading', async () => {
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('The pointer is not active', 'NotFoundError');
    });
    mount();
    const thumb = screen.getByRole('slider', { name: '手柄光标速度' });
    const root = thumb.closest<HTMLElement>('[aria-disabled]')!;
    expect(root.getAttribute('aria-disabled')).toBe('true');
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200 } as DOMRect);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(root.firstElementChild);

    act(() => clickControllerPointer(screen.getByTestId('panel'), { x: 220, y: 10 }));
    expect(thumb.getAttribute('aria-valuenow')).toBe('100');
    expect(await savedSpeed()).toBe(100);
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps the last controller selection when the user quickly returns to the original value', async () => {
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('The pointer is not active', 'NotFoundError');
    });
    mount();
    const { thumb, track } = await sliderParts();
    const panel = screen.getByTestId('panel');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(track);
    act(() => {
      clickControllerPointer(panel, { x: 220, y: 10 });
      clickControllerPointer(panel, { x: 167, y: 10 });
    });
    // The shared lock completes after all writes queued by both selections.
    await act(async () => { await navigator.locks.request('settings-file', async () => {}); });
    expect(await savedSpeed()).toBe(100);
    expect(thumb.getAttribute('aria-valuenow')).toBe('100');
  });

  it('keeps real mouse drag changes local until the pointer is released', async () => {
    let captured = false;
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => { captured = true; });
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation(() => captured);
    vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation(() => { captured = false; });
    mount();
    const { thumb, track } = await sliderParts();

    fireEvent.pointerDown(track, { pointerId: 1, button: 0, buttons: 1, clientX: 220 });
    expect(thumb.getAttribute('aria-valuenow')).toBe('140');
    await act(async () => {});
    expect(await savedSpeed()).toBe(100);
    fireEvent.pointerMove(track, { pointerId: 1, buttons: 1, clientX: 260 });
    expect(thumb.getAttribute('aria-valuenow')).toBe('170');
    await act(async () => {});
    expect(await savedSpeed()).toBe(100);
    fireEvent.pointerUp(track, { pointerId: 1, button: 0, buttons: 0, clientX: 260 });
    await waitFor(async () => expect(await savedSpeed()).toBe(170));
    expect(Number(screen.getByTestId('pointer-position').textContent)).toBeCloseTo(219);
  });
});
