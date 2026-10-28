// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CorruptedZonePage from './CorruptedZonePage';
import CorruptedZoneController from './CorruptedZoneController';

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  visible: true,
  loading: false,
  update: vi.fn(),
  rect: { x: 600, y: 8, width: 720, height: 48 },
  setRect: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  release: vi.fn(),
}));
vi.mock('@/hooks/useOptions', () => ({
  useOptions: () => ({ settings: state.settings, isLoading: state.loading, updateSettings: state.update }),
}));
vi.mock('@/overlay', () => ({
  useOverlay: () => ({ openPanel: state.open, closePanel: state.close }),
  usePanel: () => ({ rect: state.rect, setRect: state.setRect, visible: state.visible }),
}));
vi.mock('@/overlay/region', () => ({ holdRegionLoop: () => state.release }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
  state.settings = {};
  state.visible = true;
  state.loading = false;
  vi.clearAllMocks();
  window.innerWidth = 1920;
  window.innerHeight = 1080;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('corrupted-zone lifecycle', () => {
  it('uses a separate saved position for the compact view and restores the full view position', () => {
    state.settings = { corruptedZoneMini: true, corruptedZonePosition: { x: 600, y: 200 } };
    const { rerender } = render(<CorruptedZonePage />);
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 8, y: 8, width: 320, height: 48 });
    state.settings = { ...state.settings, corruptedZoneMiniPosition: { x: 100, y: 60 } };
    rerender(<CorruptedZonePage />);
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 100, y: 60, width: 320, height: 48 });
    state.settings = { ...state.settings, corruptedZoneMini: false };
    rerender(<CorruptedZonePage />);
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 600, y: 200, width: 720, height: 48 });
  });
  it('applies the saved local transparency to the floating card independently of the app', () => {
    state.settings = { corruptedZoneTransparency: 65, windowTransparency: 10 };
    const { container, rerender } = render(<CorruptedZonePage />);
    const card = () => container.querySelector<HTMLElement>('[data-slot="window-panel"]')!;
    expect(card().style.getPropertyValue('--window-opacity')).toBe('35%');
    state.settings = { ...state.settings, windowTransparency: 90 };
    rerender(<CorruptedZonePage />);
    expect(card().style.getPropertyValue('--window-opacity')).toBe('35%');
  });
  it('persists the chosen damage type through the existing settings provider', () => {
    state.settings = { corruptedZoneDamageType: 'lightning' };
    render(<CorruptedZonePage />);
    fireEvent.click(screen.getByLabelText('切换主要伤害类型'));
    expect(state.update).toHaveBeenCalledWith({ corruptedZoneDamageType: 'cold' });
  });
  it('centres on the screen on first open and again after returning to the game', () => {
    const { rerender } = render(<CorruptedZonePage />);
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 600, y: 8, width: 720, height: 48 });
    state.visible = false;
    rerender(<CorruptedZonePage />);
    state.setRect.mockClear();
    state.visible = true;
    rerender(<CorruptedZonePage />);
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 600, y: 8, width: 720, height: 48 });
  });

  it('stops its clock while hidden and immediately refreshes after a missed rotation', () => {
    const { rerender } = render(<CorruptedZonePage />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText('剩余时间').textContent).toBe('14:59');
    state.visible = false;
    rerender(<CorruptedZonePage />);
    act(() => vi.advanceTimersByTime(15 * 60 * 1000));
    expect(screen.getByLabelText('剩余时间').textContent).toBe('14:59');
    state.visible = true;
    rerender(<CorruptedZonePage />);
    expect(screen.getByLabelText('剩余时间').textContent).toBe('14:59');
    expect(screen.getByText('鲜血荒地 · 邪恶洞窟')).toBeTruthy();
  });

  it('persists hide/expand and routes the appearance button to its settings section', () => {
    render(<CorruptedZonePage />);
    fireEvent.click(screen.getByLabelText('隐藏腐化区提示'));
    expect(state.update).toHaveBeenCalledWith({ corruptedZoneEnabled: false });
    fireEvent.click(screen.getByLabelText('展开未来四轮'));
    expect(state.update).toHaveBeenCalledWith({ corruptedZoneExpanded: true });
    fireEvent.click(screen.getByLabelText('腐化区外观设置'));
    expect(state.open).toHaveBeenCalledWith('settings', { section: 'Corrupted Zone' });
  });

  it('clamps a saved position after switching to a smaller monitor', () => {
    state.settings = { corruptedZonePosition: { x: 1500, y: 900 }, corruptedZoneWidth: 560 };
    render(<CorruptedZonePage />);
    window.innerWidth = 800;
    window.innerHeight = 600;
    fireEvent(window, new Event('resize'));
    expect(state.setRect).toHaveBeenLastCalledWith({ x: 240, y: 552, width: 560, height: 48 });
  });

  it('releases the region drag loop if game focus is lost mid-drag', () => {
    const { rerender } = render(<CorruptedZonePage />);
    const title = screen.getByText('腐化区提示');
    fireEvent.pointerDown(title, { button: 0, pointerId: 1, clientX: 800, clientY: 25 });
    state.visible = false;
    rerender(<CorruptedZonePage />);
    expect(state.release).toHaveBeenCalledOnce();
  });

  it('waits for settings to load and needs no account token to enable the card', () => {
    state.loading = true;
    const { rerender } = render(<CorruptedZoneController />);
    expect(state.open).not.toHaveBeenCalled();
    state.loading = false;
    rerender(<CorruptedZoneController />);
    expect(state.open).toHaveBeenLastCalledWith('corruptedZone');
    state.settings = { corruptedZoneEnabled: false };
    rerender(<CorruptedZoneController />);
    expect(state.close).toHaveBeenLastCalledWith('corruptedZone');
  });
});
