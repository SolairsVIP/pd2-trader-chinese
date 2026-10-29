// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { useOptions } from '@/hooks/useOptions';
import { usePanel } from '@/overlay';
import { createOptionsStore, type OptionsStore } from './test-utils';
import SettingsLayout from './options-layout';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('@/overlay', () => ({ usePanel: vi.fn() }));
// Section bodies have their own tests; stand-ins expose which one is mounted. vi.mock factories are
// hoisted above static imports, so SettingsLink has to be loaded inside the factory.
vi.mock('./appearance/layout', async () => {
  const { SettingsLink } = await import('./settings-ui');
  return {
    default: () => (
      <p>
        general-body <SettingsLink to="Net Worth">go net worth</SettingsLink>
      </p>
    ),
  };
});
vi.mock('./account/layout', () => ({ default: () => <p>account-body</p> }));
vi.mock('./chat/layout', () => ({ default: () => <p>chat-body</p> }));
vi.mock('./interface/layout', () => ({ default: () => <p>interface-body</p> }));
vi.mock('./stats/layout', () => ({ default: () => <p>price-check-body</p> }));
vi.mock('./networth/layout', () => ({ default: () => <p>net-worth-body</p> }));
vi.mock('./hotkeys/layout', () => ({ default: () => <p>hotkeys-body</p> }));
vi.mock('./about/layout', () => ({ default: () => <p>about-body</p> }));
vi.mock('./updates/layout', () => ({ default: () => <p>updates-body</p> }));

const SECTIONS = ['常规', '账户', '聊天', '界面', '物品估价', '仓库估值', '腐化区提示', '快捷键', '手柄', '关于', '更新'];

let store: OptionsStore;
const close = vi.fn();

function renderLayout() {
  store = createOptionsStore({ mode: 'softcore' });
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  return render(<SettingsLayout />);
}

const tab = (name: string) => screen.getByRole('tab', { name });
const selected = () =>
  screen
    .getAllByRole('tab')
    .filter((t) => t.getAttribute('aria-selected') === 'true')
    .map((t) => t.textContent);
const panelText = () => screen.getByRole('tabpanel').textContent;
const status = () => screen.getByText(/已保存|更改会自动保存/).textContent;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  close.mockReset();
  vi.mocked(usePanel).mockReturnValue({ close } as never);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SettingsLayout navigation', () => {
  it('provides a dedicated controller section', () => {
    renderLayout();
    fireEvent.click(tab('手柄'));
    expect(selected()).toEqual(['手柄']);
    expect(screen.getByRole('switch', { name: '手柄快捷查价' })).not.toBeNull();
    expect(screen.getByRole('slider', { name: '手柄光标速度' })).not.toBeNull();
  });
  it('opens on General with a single tab stop', () => {
    renderLayout();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(SECTIONS);
    expect(selected()).toEqual(['常规']);
    expect(panelText()).toContain('general-body');
    expect(screen.getAllByRole('tab').filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it('switches the panel when a tab is clicked', () => {
    renderLayout();
    fireEvent.click(tab('快捷键'));
    expect(selected()).toEqual(['快捷键']);
    expect(panelText()).toBe('hotkeys-body');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab('快捷键').id);
  });

  it('arrow keys wrap around and move focus with the selection', () => {
    renderLayout();
    fireEvent.keyDown(tab('常规'), { key: 'ArrowUp' });
    expect(selected()).toEqual(['更新']);
    expect(document.activeElement).toBe(tab('更新'));

    fireEvent.keyDown(tab('更新'), { key: 'ArrowDown' });
    expect(selected()).toEqual(['常规']);
  });

  it('Home and End jump to the ends; other keys do nothing', () => {
    renderLayout();
    fireEvent.keyDown(tab('常规'), { key: 'End' });
    expect(selected()).toEqual(['更新']);
    fireEvent.keyDown(tab('更新'), { key: 'Home' });
    expect(selected()).toEqual(['常规']);
    fireEvent.keyDown(tab('常规'), { key: 'ArrowRight' });
    expect(selected()).toEqual(['常规']);
  });

  it('lets a section link jump to another section', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: /go net worth/ }));
    expect(selected()).toEqual(['仓库估值']);
    expect(panelText()).toBe('net-worth-body');
  });

  it('closing closes the settings panel', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('opens on the section asked for, and switches to it on every re-open', () => {
    vi.mocked(usePanel).mockReturnValue({ close, payload: { section: 'Chat' }, payloadVersion: 1 } as never);
    const view = renderLayout();
    expect(selected()).toEqual(['聊天']);
    expect(panelText()).toBe('chat-body');

    fireEvent.click(tab('快捷键'));
    // Re-opened without a section: stays where the user was
    vi.mocked(usePanel).mockReturnValue({ close, payload: undefined, payloadVersion: 2 } as never);
    view.rerender(<SettingsLayout />);
    expect(selected()).toEqual(['快捷键']);

    vi.mocked(usePanel).mockReturnValue({ close, payload: { section: 'Chat' }, payloadVersion: 3 } as never);
    view.rerender(<SettingsLayout />);
    expect(selected()).toEqual(['聊天']);
  });
});

describe('SettingsLayout saved indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-01T00:00:00Z') });
  });

  it('flashes "Saved" for a change made right after the user interacts, then fades back', () => {
    renderLayout();
    expect(status()).toBe('更改会自动保存');

    fireEvent.pointerDown(window);
    act(() => vi.advanceTimersByTime(500));
    act(() => store.replace({ mode: 'hardcore' }));
    expect(status()).toBe('已保存');

    act(() => vi.advanceTimersByTime(1600));
    expect(status()).toBe('更改会自动保存');
  });

  it('counts a keypress as interaction too', () => {
    renderLayout();
    fireEvent.keyDown(window, { key: 'x' });
    act(() => store.replace({ mode: 'hardcore' }));
    expect(status()).toBe('已保存');
  });

  it('ignores background changes with no recent interaction', () => {
    renderLayout();
    act(() => store.replace({ mode: 'hardcore' }));
    expect(status()).toBe('更改会自动保存');
  });

  it('ignores changes arriving more than 2.5s after the last interaction', () => {
    renderLayout();
    fireEvent.pointerDown(window);
    act(() => vi.advanceTimersByTime(2501));
    act(() => store.replace({ mode: 'hardcore' }));
    expect(status()).toBe('更改会自动保存');
  });

  it('does not flash when settings finish loading', () => {
    store = createOptionsStore({ mode: 'softcore' }, true);
    vi.mocked(useOptions).mockImplementation(store.useOptions);
    render(<SettingsLayout />);
    fireEvent.pointerDown(window);
    act(() => store.replace({ mode: 'hardcore' }, false));
    expect(status()).toBe('更改会自动保存');
  });
});
