// @vitest-environment happy-dom
import { MotionGlobalConfig } from 'framer-motion';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeItem } from '@/lib/item-utils';
import ItemWindow from './ItemPage';

const h = vi.hoisted(() => ({
  panel: { payload: undefined as { text: string; controller?: boolean } | undefined, payloadVersion: 0, close: (() => {}) as () => void, visible: false },
}));

vi.mock('@/overlay', () => ({ usePanel: () => h.panel, isKeyboardClaimed: () => true }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: () => ({ settings: {} }) }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
// The widget is tested on its own; here it only needs to show the item it was given.
vi.mock('@/pages/price-check/components/ItemOverlayWidget', () => ({
  default: ({ item, onClose }: { item: { name: string }; onClose: () => void }) => (
    <div data-testid="widget">
      {item.name}
      <button onClick={onClose}>widget close</button>
    </div>
  ),
}));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const close = vi.fn();
const encode = (item: object) => encodeItem(JSON.stringify(item));

/** Simulates openPanel('itemSearch', { text }): new payload, bumped payloadVersion. */
function search(text: string | undefined) {
  h.panel = { payload: text === undefined ? undefined : { text }, payloadVersion: h.panel.payloadVersion + 1, close, visible: true };
}

function renderWith(text: string | undefined) {
  search(text);
  return render(<ItemWindow />);
}

beforeEach(() => {
  h.panel = { payload: undefined, payloadVersion: 0, close, visible: false };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

describe('ItemPage (item search panel)', () => {
  it('shows the empty state before the first search', () => {
    renderWith(undefined);
    expect(screen.getByText('未提供物品数据，或解析失败。')).not.toBeNull();
    expect(screen.queryByTestId('widget')).toBeNull();
  });

  it('renders the searched item, including non-ASCII names', () => {
    renderWith(encode({ name: 'Ánnihilus Ü' }));
    expect(screen.getByTestId('widget').textContent).toContain('Ánnihilus Ü');
  });

  it('falls back to the empty state and logs when the payload is garbage', () => {
    renderWith('%%%not-base64');
    expect(screen.getByText('未提供物品数据，或解析失败。')).not.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('switches to the item of a new search while open', () => {
    const view = renderWith(encode({ name: 'Shako' }));
    search(encode({ name: 'Tyrael\u2019s Might' }));
    view.rerender(<ItemWindow />);
    expect(screen.getByTestId('widget').textContent).toContain('Tyrael\u2019s Might');
  });

  it('keeps the current item when a new search cannot be parsed', () => {
    const view = renderWith(encode({ name: 'Shako' }));
    search('garbage');
    view.rerender(<ItemWindow />);
    expect(screen.getByTestId('widget').textContent).toContain('Shako');
  });

  it('closing closes the panel (empty state and widget)', () => {
    const empty = renderWith(undefined);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(close).toHaveBeenCalledTimes(1);
    empty.unmount();

    renderWith(encode({ name: 'Shako' }));
    fireEvent.click(screen.getByText('widget close'));
    expect(close).toHaveBeenCalledTimes(2);
  });
});
