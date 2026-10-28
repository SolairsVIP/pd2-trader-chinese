// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarketPinButton from './MarketPinButton';

const guard = vi.hoisted(() => ({ canDismiss: null as null | (() => boolean), cleanup: vi.fn() }));
vi.mock('@/overlay', () => ({ useOverlay: () => ({ setMarketPinned: vi.fn(), guardPanelDismissal: (_id: string, fn: () => boolean) => { guard.canDismiss = fn; return guard.cleanup; } }) }));
afterEach(() => { cleanup(); guard.canDismiss = null; guard.cleanup.mockClear(); });

describe('market pin', () => {
  it('protects against automatic dismissal only while pinned and removes the guard on unmount', () => {
    const view = render(<MarketPinButton />);
    expect(guard.canDismiss?.()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '固定窗口' }));
    expect(screen.getByRole('button', { name: '取消固定窗口' }).getAttribute('aria-pressed')).toBe('true');
    expect(guard.canDismiss?.()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '取消固定窗口' }));
    expect(guard.canDismiss?.()).toBe(true);
    view.unmount();
    expect(guard.cleanup).toHaveBeenCalled();
  });
});
