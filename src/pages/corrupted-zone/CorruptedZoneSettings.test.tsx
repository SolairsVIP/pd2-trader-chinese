// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import { applyWindowTransparency, getTheme, THEMES } from '@/lib/themes';
import { createOptionsStore } from '@/components/dialogs/optionsv2/test-utils';
import CorruptedZoneSettings from './CorruptedZoneSettings';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--window-opacity');
  document.documentElement.style.removeProperty('--window-opacity-elevated');
  localStorage.clear();
});

it('persists the local slider, previews it, and stays independent of the app transparency', async () => {
  const theme = THEMES.find((theme) => theme.mode === 'light')!;
  const store = createOptionsStore({ windowTransparency: 70, themeId: theme.id });
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  applyWindowTransparency(70);
  const { container, unmount } = render(<CorruptedZoneSettings />);
  const panel = () => container.querySelector<HTMLElement>('[data-slot="window-panel"]')!;
  expect(screen.getByLabelText('腐化区提示效果预览').contains(panel())).toBe(true);
  const slider = screen.getByRole('slider', { name: '腐化区背景透明度' });
  expect(slider.getAttribute('aria-valuenow')).toBe('0');
  expect(panel().style.getPropertyValue('--window-opacity')).toBe('100%');
  expect(panel().style.getPropertyValue('--surface')).toBe(getTheme(theme.id).vars.surface);

  await act(async () => {
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
  });
  expect(store.updateSettings).toHaveBeenLastCalledWith({ corruptedZoneTransparency: 1 });
  expect(slider.getAttribute('aria-valuenow')).toBe('1');
  expect(panel().style.getPropertyValue('--window-opacity')).toBe('99%');
  expect(document.documentElement.style.getPropertyValue('--window-opacity')).toBe('30%');
  expect(panel().style.opacity).toBe(''); // Keep text/countdown fully legible.

  await act(async () => {
    store.replace({
      windowTransparency: 0,
      corruptedZoneTransparency: 60,
      themeId: theme.id,
      corruptedZoneCustomColors: true,
      corruptedZoneColors: { background: '#123456', text: '#ffffff', accent: '#abcdef' },
    });
    applyWindowTransparency(0);
  });
  expect(panel().style.getPropertyValue('--window-opacity')).toBe('40%');
  expect(panel().style.getPropertyValue('--surface')).toContain('#123456');
  expect(document.documentElement.style.getPropertyValue('--window-opacity')).toBe('100%');
  unmount();
  const reopened = render(<CorruptedZoneSettings />);
  expect(screen.getByRole('slider', { name: '腐化区背景透明度' }).getAttribute('aria-valuenow')).toBe('60');
  expect(
    reopened.container
      .querySelector<HTMLElement>('[data-slot="window-panel"]')!
      .style.getPropertyValue('--window-opacity'),
  ).toBe('40%');
});
