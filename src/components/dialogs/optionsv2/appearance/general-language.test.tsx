// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import { createOptionsStore } from '../test-utils';
import { GeneralForm } from './general-form';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/overlay', () => ({ showToast: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock('@/components/ui/select', async () => (await import('../test-utils')).selectShim);
afterEach(cleanup);
it('shows the plugin language first and saves a change', () => {
  const store = createOptionsStore({ mode: 'softcore', ladder: 'ladder', diablo2Directory: '' }, false);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  render(<GeneralForm />);
  const language = screen.getByRole('combobox', { name: '界面语言' });
  expect(screen.getAllByRole('combobox')[0]).toBe(language);
  fireEvent.change(language, { target: { value: 'zh-TW' } });
  expect(store.updateSettings).toHaveBeenCalledWith({ uiLanguage: 'zh-TW' });
  expect(screen.getByRole('combobox', { name: '界面語言' })).toBeTruthy();
});
