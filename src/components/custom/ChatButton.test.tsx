// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatButton } from './ChatButton';
import { collectRegion } from '@/overlay/region';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SIZE = { width: 40, height: 110 };
const caret = () => screen.getByRole('button', { name: '更多' });
const menu = () => screen.queryByRole('menu');
const dock = () => caret().closest('[data-interactive="true"]')!;

function renderDock(props: Partial<React.ComponentProps<typeof ChatButton>> = {}) {
  return render(<ChatButton size={SIZE}
    onChatClick={vi.fn()}
    onOffersClick={vi.fn()}
    {...props} />);
}

describe('ChatButton', () => {
  it('opens the experimental corruption page from the shard and closes More', () => {
    const onCorruptionLuckClick = vi.fn();
    renderDock({ onCorruptionLuckClick, onSettingsClick: vi.fn() });
    fireEvent.click(caret());
    fireEvent.click(screen.getByRole('button', { name: '打开腐化前试试手气' }));
    expect(onCorruptionLuckClick).toHaveBeenCalledOnce();
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });
  it('restores the corrupted-zone card from More and closes the menu afterwards', () => {
    const onCorruptedZoneClick = vi.fn();
    renderDock({ onCorruptedZoneClick });
    fireEvent.click(caret());
    fireEvent.click(screen.getByRole('menuitem', { name: '腐化区提示' }));
    expect(onCorruptedZoneClick).toHaveBeenCalledOnce();
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });
  it('nothing opens on hover: the menu only opens from the caret', () => {
    renderDock({ onSettingsClick: vi.fn() });
    act(() => {
      fireEvent.pointerEnter(dock());
      fireEvent.mouseEnter(dock());
    });
    expect(menu()).toBeNull();

    fireEvent.click(caret());
    expect(menu()).not.toBeNull();
    expect(caret().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(caret());
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes an open menu when opening the market directly', () => {
    const onMarketClick = vi.fn();
    renderDock({ onMarketClick });
    fireEvent.click(caret());
    expect(menu()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开交易大厅' }));
    expect(onMarketClick).toHaveBeenCalledTimes(1);
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the caret clickable despite small pointer movement when dragging is enabled', () => {
    const onDrag = vi.fn();
    renderDock({ onDrag, onSettingsClick: vi.fn() });
    fireEvent.click(caret());
    fireEvent.pointerDown(caret(), { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 106, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(caret());
    expect(caret().getAttribute('aria-expanded')).toBe('false');
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('includes the expanded menu outside the dock in the native window region', () => {
    renderDock({ onSettingsClick: vi.fn() });
    const box = (x: number, y: number, width: number, height: number) =>
      ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height } as DOMRect);
    dock().getBoundingClientRect = () => box(1200, 800, 40, 110);
    fireEvent.click(caret());
    menu()!.getBoundingClientRect = () => box(1032, 600, 208, 190);
    expect(collectRegion(document, 1)).toEqual([
      { x: 1196, y: 796, width: 48, height: 118 },
      { x: 1028, y: 596, width: 216, height: 198 },
    ]);
    fireEvent.click(caret());
    // AnimatePresence may keep the exit node until the animation completes; it must eventually leave.
    act(() => vi.runOnlyPendingTimers());
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open the market when releasing a drag on its button', () => {
    const onMarketClick = vi.fn();
    const onDrag = vi.fn();
    renderDock({ onMarketClick, onDrag });
    const market = screen.getByRole('button', { name: '打开交易大厅' });
    fireEvent.pointerDown(market, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(market);
    expect(onDrag).toHaveBeenCalledWith(30);
    expect(onMarketClick).not.toHaveBeenCalled();
    fireEvent.click(market);
    expect(onMarketClick).toHaveBeenCalledTimes(1);
  });

  it('lists only the windows whose handlers are provided, with Disable apart at the end', () => {
    renderDock({ onSettingsClick: vi.fn(), onDisableClick: vi.fn() });
    fireEvent.click(caret());
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '聊天',
      '报价',
      '设置',
      '关闭悬浮按钮',
    ]);
  });

  it('shows no badges when counts are zero and caps large counts at 99+', () => {
    const { rerender } = renderDock();
    expect(screen.queryByLabelText(/条未读消息$/)).toBeNull();
    expect(screen.queryByLabelText(/条交易报价$/)).toBeNull();

    rerender(
      <ChatButton size={SIZE}
        onChatClick={vi.fn()}
        onOffersClick={vi.fn()}
        unreadCount={100}
        tradeOffersCount={99} />,
    );
    expect(screen.getByLabelText('100 条未读消息').textContent).toBe('99+');
    expect(screen.getByLabelText('99 条交易报价').textContent).toBe('99');
  });

  it('closes the open menu after the pointer stays out for the grace period, not when it comes back in time', () => {
    renderDock({ onSettingsClick: vi.fn() });
    fireEvent.click(caret());

    act(() => {
      fireEvent.pointerLeave(dock());
      vi.advanceTimersByTime(300);
      fireEvent.pointerEnter(dock());
      vi.advanceTimersByTime(1000);
    });
    expect(menu()).not.toBeNull();

    act(() => {
      fireEvent.pointerLeave(dock());
      vi.advanceTimersByTime(400);
    });
    expect(caret().getAttribute('aria-expanded')).toBe('false');
  });
});
