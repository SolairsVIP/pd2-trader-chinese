// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmToast,
  setBadgeCount,
  showToast,
  useOverlay,
  type ConfirmToastOptions,
  type OverlayApi,
} from '@/overlay';
import type * as Overlay from '@/overlay';
import { useOptions } from '@/hooks/useOptions';
import ChatButtonPage from './ChatButtonPage';
import { setChatDockOffset } from './chat-dock';

vi.mock('@/overlay', async (importOriginal) => ({
  ...(await importOriginal<typeof Overlay>()),
  showToast: vi.fn(),
  confirmToast: vi.fn(),
  useOverlay: vi.fn(),
}));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const updateSettings = vi.fn();
// A 1920x1080 game: the dock is 43x204, flush on the right edge, 9px above the bottom (x 1877, y 867)
const overlay = { openPanel: vi.fn(), togglePanel: vi.fn(), gameRect: { x: 0, y: 0, width: 1920, height: 1080 } };

beforeEach(() => {
  vi.clearAllMocks();
  updateSettings.mockResolvedValue(undefined);
  vi.mocked(useOptions).mockImplementation(() => ({ updateSettings }) as never);
  vi.mocked(useOverlay).mockImplementation(() => overlay as unknown as OverlayApi);
});

afterEach(() => {
  cleanup();
  act(() => {
    setBadgeCount('chatUnread', 0);
    setBadgeCount('whisperTrades', 0);
    setBadgeCount('tradeOffers', 0);
    setChatDockOffset(0.008);
  });
  localStorage.clear();
});

describe('ChatButtonPage', () => {
  it('opens the corruption experiment through the existing panel API', () => {
    render(<ChatButtonPage />);
    fireEvent.click(screen.getByRole('button', { name: '打开腐化前试试手气' }));
    expect(overlay.openPanel.mock.calls).toEqual([['corruptionLuck']]);
  });
  it('shows the unread chat badge count', async () => {
    render(<ChatButtonPage />);
    expect(screen.queryByLabelText(/条未读消息$/)).toBeNull();

    act(() => setBadgeCount('chatUnread', 4));
    expect(screen.getByLabelText('4 条未读消息').textContent).toBe('4');

    // let the badge finish its exit animation
    await act(async () => setBadgeCount('chatUnread', 0));
    await waitFor(() => expect(screen.queryByLabelText(/条未读消息$/)).toBeNull());
  });

  it('sums whisper and website offer badges into one trade badge, each source replacing its own share', () => {
    render(<ChatButtonPage />);
    act(() => setBadgeCount('whisperTrades', 2));
    expect(screen.getByLabelText('2 条交易报价')).not.toBeNull();

    act(() => setBadgeCount('tradeOffers', 4));
    expect(screen.getByLabelText('6 条交易报价')).not.toBeNull();

    act(() => setBadgeCount('whisperTrades', 0));
    expect(screen.getByLabelText('4 条交易报价')).not.toBeNull();
  });

  it('asks for confirmation before disabling the overlay, then disables it and notifies the user', async () => {
    const order: string[] = [];
    updateSettings.mockImplementation(async (s: unknown) => {
      order.push(`update ${JSON.stringify(s)}`);
    });
    vi.mocked(showToast).mockImplementation(() => {
      order.push('showToast');
    });
    render(<ChatButtonPage />);

    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '关闭悬浮按钮' }));
    expect(confirmToast).toHaveBeenCalledTimes(1);
    expect(updateSettings).not.toHaveBeenCalled();

    const options = vi.mocked(confirmToast).mock.calls[0][0] as ConfirmToastOptions;
    expect(options).toMatchObject({ title: '要禁用聊天悬浮按钮吗？', confirmLabel: '禁用' });
    await act(async () => {
      await options.onConfirm();
    });
    expect(order).toEqual(['update {"chatButtonOverlayEnabled":false}', 'showToast']);
  });

  it('opens chat from the pill, on the newest unread thread when there is one', () => {
    render(<ChatButtonPage />);
    fireEvent.click(screen.getByRole('button', { name: '打开 PD2 聊天' }));
    act(() => setBadgeCount('chatUnread', 2));
    fireEvent.click(screen.getByRole('button', { name: '打开 PD2 聊天' }));
    expect(overlay.togglePanel.mock.calls).toEqual([['chat'], ['chat', { newestUnread: true }]]);
  });

  it('opens the market directly from the button above chat without expanding the menu', () => {
    render(<ChatButtonPage />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('打开腐化前试试手气');
    expect(buttons[1].getAttribute('aria-label')).toBe('打开交易大厅');
    expect(buttons[2].getAttribute('aria-label')).toBe('打开 PD2 聊天');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开交易大厅' }));
    expect(overlay.openPanel.mock.calls).toEqual([['market']]);
    expect(overlay.togglePanel).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['交易大厅', ['market']],
    // Beside the dock: right edges aligned, above it (no room below)
    ['仓库估值', ['netWorthPanel', undefined, { placement: { x: 1560, y: 439 } }]],
    ['仓库价值', ['currency']],
    // Offers: chat on the Selling filter
    ['报价', ['chat', { filter: 'selling' }]],
    // keepPayload: an open quick list keeps the item being listed
    ['管理上架物品', ['quickList', undefined, { placement: 'gameCenter', keepPayload: true }]],
    ['设置', ['settings']],
  ] as const)('menu: %s opens its window and closes the menu', (name, args) => {
    render(<ChatButtonPage />);
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    fireEvent.click(screen.getByRole('menuitem', { name }));
    expect(overlay.openPanel.mock.calls).toEqual([args]);
    expect(screen.getByRole('button', { name: '更多' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('slides along the edge when dragged, saves the spot on release, and the drag does not click', () => {
    render(<ChatButtonPage />);
    const tab = screen.getByTitle('拖动以移动');
    const dock = () => tab.closest<HTMLElement>('.absolute.right-0')!;
    expect(dock().style.top).toBe('867px');

    fireEvent.pointerDown(tab, { button: 0, clientY: 1000, pointerId: 1 });
    fireEvent.pointerMove(tab, { clientY: 900, pointerId: 1 });
    expect(dock().style.top).toBe('767px');
    expect(localStorage.getItem('pd2-chat-dock-offset-v1')).toBeNull(); // saved on release only

    // Dragged past the top: stops with the tab inside the game
    fireEvent.pointerMove(tab, { clientY: -2000, pointerId: 1 });
    expect(dock().style.top).toBe('0px');
    fireEvent.pointerUp(tab, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: '打开 PD2 聊天' }));
    expect(overlay.togglePanel).not.toHaveBeenCalled();
    expect(Number(localStorage.getItem('pd2-chat-dock-offset-v1'))).toBeCloseTo(1 - 204 / 1080);

    // Near the top the menu opens below the tab
    fireEvent.click(screen.getByRole('button', { name: '更多' }));
    expect(screen.getByRole('menu').className).toContain('top-full');
  });
});
