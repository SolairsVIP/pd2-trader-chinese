// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatButton } from './ChatButton';

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
