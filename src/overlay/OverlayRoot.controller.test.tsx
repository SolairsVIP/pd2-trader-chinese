// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OverlayRoot } from './OverlayRoot';

const state = vi.hoisted(() => ({ id: 'corruptedZone', closePanel: vi.fn(), releaseKeyboard: vi.fn(async () => {}) }));
vi.mock('./OverlayProvider', () => ({
  useOverlay: () => ({ closePanel: state.closePanel }),
  useOverlayInternals: () => ({ defs: { [state.id]: {} }, state: { panels: { [state.id]: { open: true, z: 1 } } }, gameFocused: true, marketPinned: false }),
  isPanelVisible: () => true,
}));
vi.mock('./keyboard', () => ({ claimKeyboard: vi.fn(), releaseKeyboard: state.releaseKeyboard }));
vi.mock('./region', () => ({ useRegionSync: vi.fn() }));
vi.mock('./Panel', () => ({ Panel: () => null }));
vi.mock('./toast', () => ({ ToastLayer: () => null }));
vi.mock('@/pages/price-check/ControllerPointer', () => ({ default: ({ close }: { close: () => void }) => <button onClick={close}>返回</button> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); state.id = 'corruptedZone'; });

it('leaves the corruption notice visible and returns control to the game', () => {
  render(<OverlayRoot />);
  fireEvent(window, new Event('controller-activate'));
  fireEvent.click(screen.getByText('返回'));
  expect(state.closePanel).not.toHaveBeenCalled();
  expect(state.releaseKeyboard).toHaveBeenCalledWith({ focusGame: true });
  expect(screen.queryByText('返回')).toBeNull();
});

it('continues to close ordinary panels on return', () => {
  state.id = 'market';
  render(<OverlayRoot />);
  fireEvent(window, new Event('controller-activate'));
  fireEvent.click(screen.getByText('返回'));
  expect(state.closePanel).toHaveBeenCalledWith('market');
  expect(state.releaseKeyboard).not.toHaveBeenCalled();
});

it('closes the price check from its controller cursor', () => {
  state.id = 'itemSearch';
  render(<OverlayRoot />);
  fireEvent(window, new Event('controller-activate'));
  fireEvent.click(screen.getByText('返回'));
  expect(state.closePanel).toHaveBeenCalledWith('itemSearch');
});

it('removes the controller cursor when focus returns to the game without hiding the notice', () => {
  render(<OverlayRoot />);
  fireEvent(window, new Event('controller-activate'));
  expect(screen.getByText('返回')).toBeTruthy();
  fireEvent(window, new Event('controller-deactivate'));
  expect(screen.queryByText('返回')).toBeNull();
  expect(state.closePanel).not.toHaveBeenCalled();
});
