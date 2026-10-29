// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ControllerMenu from './ControllerMenu';

const overlay = vi.hoisted(() => ({ openPanel: vi.fn(), closePanel: vi.fn() }));
const options = vi.hoisted(() => ({ updateSettings: vi.fn() }));
vi.mock('@/overlay', () => ({ usePanel: () => ({ close: vi.fn() }), useOverlay: () => overlay }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: () => options }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('opens the market with focus before closing the controller menu', () => {
  render(<ControllerMenu />);
  fireEvent.click(screen.getByRole('button', { name: '交易大厅' }));
  expect(overlay.openPanel).toHaveBeenCalledWith('market', undefined, { focus: true });
  expect(overlay.closePanel).toHaveBeenCalledWith('controllerMenu', { focusGame: false });
  expect(overlay.openPanel.mock.invocationCallOrder[0]).toBeLessThan(overlay.closePanel.mock.invocationCallOrder[0]);
  expect(options.updateSettings).not.toHaveBeenCalled();
});

it('preserves an in-progress listing when opening listing management', () => {
  render(<ControllerMenu />);
  fireEvent.click(screen.getByRole('button', { name: '管理上架物品' }));
  expect(overlay.openPanel).toHaveBeenCalledWith('quickList', undefined, {
    focus: true,
    placement: 'gameCenter',
    keepPayload: true,
  });
  expect(overlay.closePanel).toHaveBeenCalledWith('controllerMenu', { focusGame: false });
  expect(options.updateSettings).not.toHaveBeenCalled();
});

it.each([
  ['聊天', 'chat'],
  ['仓库价值', 'currency'],
  ['仓库估值', 'netWorthPanel'],
  ['腐化记录', 'corruptionLuck'],
  ['设置', 'settings'],
])('opens %s without changing the corruption notice setting', (label, id) => {
  render(<ControllerMenu />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(overlay.openPanel).toHaveBeenCalledWith(id, undefined, { focus: true });
  expect(overlay.closePanel).toHaveBeenCalledWith('controllerMenu', { focusGame: false });
  expect(options.updateSettings).not.toHaveBeenCalled();
});

it('highlights the entry under the controller pointer and clears it on exit', () => {
  render(<ControllerMenu />);
  const market = screen.getByRole('button', { name: '交易大厅' });
  const chat = screen.getByRole('button', { name: '聊天' });
  fireEvent.pointerOver(market);
  expect(market.getAttribute('data-controller-active')).toBe('true');
  fireEvent.pointerOut(market, { relatedTarget: chat });
  fireEvent.pointerOver(chat, { relatedTarget: market });
  expect(market.getAttribute('data-controller-active')).not.toBe('true');
  expect(chat.getAttribute('data-controller-active')).toBe('true');
  fireEvent.pointerOut(chat, { relatedTarget: document.body });
  expect(chat.getAttribute('data-controller-active')).not.toBe('true');
});
