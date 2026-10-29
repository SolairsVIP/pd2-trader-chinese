// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import type { ISettings } from '@/hooks/useOptions';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import { HotkeyForm } from './hotkey-form';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));

const HOTKEYS: Partial<ISettings> = {
  hotkeyModifier: 'ctrl',
  hotkeyKey: 'd',
  hotkeyModifierListItem: 'ctrl',
  hotkeyKeyListItem: 'l',
  hotkeyModifierSettings: 'ctrl',
  hotkeyKeySettings: 'o',
  hotkeyModifierCurrencyValuation: 'ctrl',
  hotkeyKeyCurrencyValuation: 'x',
  hotkeyModifierChat: 'ctrl',
  hotkeyKeyChat: 't',
  hotkeyModifierOffers: 'ctrl',
  hotkeyKeyOffers: 'b',
  hotkeyModifierDelist: 'ctrl',
  hotkeyKeyDelist: 'u',
  hotkeyModifierSnapshot: 'ctrl',
  hotkeyKeySnapshot: '',
  hotkeyModifierMarket: 'ctrl',
  hotkeyKeyMarket: 'm',
};

let store: OptionsStore;

function renderForm(settings: Partial<ISettings> = HOTKEYS, isLoading = false) {
  store = createOptionsStore(settings, isLoading);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  return render(<HotkeyForm />);
}

const keyInput = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(keyInput(label), { target: { value } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(cleanup);

describe('HotkeyForm', () => {
  it('shows a skeleton and no inputs while settings load', () => {
    renderForm(HOTKEYS, true);
    expect(screen.queryByLabelText('物品估价')).toBeNull();
  });

  it('displays the stored keys upper-cased', () => {
    renderForm();
    expect(keyInput('物品估价').value).toBe('D');
    expect(keyInput('下架物品').value).toBe('U');
  });

  it('saves a typed key lower-cased along with the rest of the hotkeys', () => {
    renderForm();
    type('物品估价', 'Q');
    expect(store.updateSettings).toHaveBeenCalledTimes(1);
    const saved = store.updateSettings.mock.calls[0][0];
    expect(saved.hotkeyKey).toBe('q');
    expect(saved.hotkeyKeyListItem).toBe('l');
    expect(keyInput('物品估价').value).toBe('Q');
  });

  it('saves the modifier picked for a row', () => {
    renderForm();
    const tabs = screen.getByRole('tablist', { name: '上架物品 的组合修饰键' });
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Alt' }));
    expect(store.updateSettings).toHaveBeenCalledTimes(1);
    expect(store.updateSettings.mock.calls[0][0]).toMatchObject({
      hotkeyModifierListItem: 'alt',
      hotkeyModifier: 'ctrl',
    });
  });

  it('lets the snapshot key be cleared to unbind it', () => {
    renderForm({ ...HOTKEYS, hotkeyKeySnapshot: 'n' });
    type('记录估值快照', '');
    expect(store.updateSettings.mock.calls.at(-1)?.[0].hotkeyKeySnapshot).toBe('');
  });

  it('lets the market key be cleared to unbind it', () => {
    renderForm(HOTKEYS);
    type('市场浏览器', '');
    expect(store.updateSettings.mock.calls.at(-1)?.[0].hotkeyKeyMarket).toBe('');
  });

  it('warns on both rows when two actions share a combo, and clears once resolved', () => {
    renderForm();
    type('聊天窗口', 'd');
    const warnings = screen.getAllByRole('status').map((el) => el.textContent);
    expect(warnings).toEqual(['已被“聊天窗口”占用。', '已被“物品估价”占用。']);

    type('聊天窗口', 'k');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('does not treat the same key on different modifiers as a clash', () => {
    renderForm({ ...HOTKEYS, hotkeyModifierChat: 'alt', hotkeyKeyChat: 'd' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('warns that Ctrl + C is reserved', () => {
    renderForm();
    type('仓库估值', 'c');
    expect(screen.getByRole('status').textContent).toContain('Ctrl + C 是复制物品的保留快捷键');
    expect(keyInput('仓库估值').getAttribute('aria-invalid')).toBe('true');
  });

  it('follows external settings changes without echoing them back as a save', () => {
    renderForm();
    act(() => store.replace({ ...HOTKEYS, hotkeyKey: 'p' }));
    expect(keyInput('物品估价').value).toBe('P');
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  // BUG: the zod schema is never run — the form auto-saves from `watch` without validating, so a key the
  // schema rejects ("Must be a letter or number") is persisted and handed to the global-shortcut registrar.
  it.fails('does not persist a key the schema rejects', () => {
    renderForm();
    type('物品估价', '!');
    expect(store.updateSettings).not.toHaveBeenCalled();
  });
});
