// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsController from '../controller/layout';

const updateSettings = vi.fn();
vi.mock('@/hooks/useOptions', () => ({ useOptions: () => ({ settings: { controllerPriceCheckEnabled: true }, isLoading: false, updateSettings }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('describes the PS shortcuts and the Xbox price-check limitation', () => {
  render(<SettingsController />);
  expect(screen.getByText(/手柄快捷查价：L2 \+ R2/)).toBeTruthy();
  expect(screen.getByText(/Xbox：按 LT \+ RT 查价.*A 点击，B 返回。其他功能暂不支持/)).toBeTruthy();
  expect(screen.getByText(/游戏可能同时响应手柄操作/)).toBeTruthy();
});

it('shows the default controller pointer speed and saves adjustments', () => {
  render(<SettingsController />);
  const slider = screen.getByRole('slider', { name: '手柄光标速度' });
  expect(slider.getAttribute('aria-valuenow')).toBe('100');
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(updateSettings).toHaveBeenCalledWith({ controllerPointerSpeed: 110 });
});

it('allows controller price check to be turned off', () => {
  render(<SettingsController />);
  fireEvent.click(screen.getByRole('switch', { name: '手柄快捷查价' }));
  expect(updateSettings).toHaveBeenCalledWith({ controllerPriceCheckEnabled: false });
});
