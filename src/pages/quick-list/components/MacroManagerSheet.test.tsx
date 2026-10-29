// @vitest-environment happy-dom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptions } from '@/hooks/useOptions';
import MacroManagerSheet, { applyMacroTemplate, getPlaceholders, isValidMacro, NoteMacro } from './MacroManagerSheet';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
vi.mock('framer-motion', () => import('@/pages/quick-list/motion-mock'));

describe('getPlaceholders', () => {
  it('returns unique placeholder names in order of first appearance, excluding itemName', () => {
    expect(getPlaceholders('WTS {itemName} {sockets}os {res}% res, {sockets} again')).toEqual(['sockets', 'res']);
  });

  it('returns an empty list when there are no braces', () => {
    expect(getPlaceholders('plain note')).toEqual([]);
  });

  it('treats any non-brace content as a name, including digits and dots', () => {
    expect(getPlaceholders('{1} {a.b}')).toEqual(['1', 'a.b']);
  });
});

describe('applyMacroTemplate', () => {
  it('fills every {itemName} occurrence and named placeholders', () => {
    expect(applyMacroTemplate('{itemName} / {itemName} {os}os', 'Shako', { os: '1' })).toBe('Shako / Shako 1os');
  });

  it('leaves {itemName} untouched when no item name is known', () => {
    expect(applyMacroTemplate('WTS {itemName}', undefined)).toBe('WTS {itemName}');
  });

  it('treats regex metacharacters in placeholder names literally', () => {
    expect(applyMacroTemplate('{a.b} {axb} {c+}', undefined, { 'a.b': 'X', 'c+': 'Y' })).toBe('X {axb} Y');
  });

  it('leaves placeholders without a provided value in place', () => {
    expect(applyMacroTemplate('{a} {b}', 'n', { a: '1' })).toBe('1 {b}');
  });
});

describe('isValidMacro', () => {
  it.each([
    [{ label: 'a', text: 'b' }, true],
    [{ label: 'a' }, false],
    [null, false],
    ['str', false],
  ])('%j -> %s', (value, expected) => {
    expect(isValidMacro(value)).toBe(expected);
  });
});

describe('MacroManagerSheet', () => {
  let stored: unknown[];
  let saves: NoteMacro[][];

  function Harness({ onApply }: { onApply?: (m: NoteMacro) => void }) {
    const [macros, setMacros] = React.useState<unknown[]>(stored);
    vi.mocked(useOptions).mockReturnValue({
      settings: { listingNoteMacros: macros },
      updateSettings: async (patch: { listingNoteMacros: NoteMacro[] }) => {
        saves.push(patch.listingNoteMacros);
        setMacros(patch.listingNoteMacros);
      },
    } as never);
    return <MacroManagerSheet onApply={onApply} />;
  }

  const newNameInput = () => screen.getAllByLabelText('模板名称').at(-1)!;
  const newTextInput = () => screen.getAllByLabelText('模板内容').at(-1)!;
  const labels = () => saves.at(-1)!.map((m) => m.label);

  async function click(el: HTMLElement) {
    await act(async () => {
      fireEvent.click(el);
    });
  }

  beforeEach(() => {
    stored = [];
    saves = [];
  });
  afterEach(cleanup);

  it('shows the empty state and disables Add until both fields are non-blank', () => {
    render(<Harness />);
    expect(screen.queryByText('暂无备注模板，可在下方添加。')).not.toBeNull();
    const add = screen.getByRole('button', { name: /添加模板/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(newNameInput(), { target: { value: 'WTS' } });
    fireEvent.change(newTextInput(), { target: { value: '   ' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(newTextInput(), { target: { value: 'x' } });
    expect(add.disabled).toBe(false);
  });

  it('adds a trimmed macro via Enter and clears the inputs', async () => {
    render(<Harness />);
    fireEvent.change(newNameInput(), { target: { value: '  WTS  ' } });
    fireEvent.change(newTextInput(), { target: { value: ' WTS {itemName} ' } });
    await act(async () => {
      fireEvent.keyDown(newTextInput(), { key: 'Enter' });
    });
    expect(saves).toEqual([[{ label: 'WTS', text: 'WTS {itemName}' }]]);
    expect((newNameInput() as HTMLInputElement).value).toBe('');
    expect((newTextInput() as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('编辑 WTS')).not.toBeNull();
  });

  it('rejects a duplicate label with an alert that clears when the name is edited', async () => {
    stored = [{ label: 'WTS', text: 'a' }];
    render(<Harness />);
    fireEvent.change(newNameInput(), { target: { value: 'WTS' } });
    fireEvent.change(newTextInput(), { target: { value: 'b' } });
    await click(screen.getByRole('button', { name: /添加模板/ }));
    expect(saves).toEqual([]);
    expect(screen.getByRole('alert').textContent).toBe('已存在名为“WTS”的宏。');
    fireEvent.change(newNameInput(), { target: { value: 'WTS2' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops malformed stored entries and renders highlighted placeholders', () => {
    stored = [{ label: 'ok', text: '{sockets} os' }, { label: 'broken' }, null];
    render(<Harness />);
    expect(screen.queryByText('broken')).toBeNull();
    expect(screen.getByText('{sockets}').tagName).toBe('CODE');
  });

  it('reorders with up/down and disables moves past the ends', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
      { label: 'C', text: '3' },
    ];
    render(<Harness />);
    expect((screen.getByLabelText('将 A 上移') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('将 C 下移') as HTMLButtonElement).disabled).toBe(true);

    await click(screen.getByLabelText('将 C 上移'));
    expect(labels()).toEqual(['A', 'C', 'B']);
    await click(screen.getByLabelText('将 A 下移'));
    expect(labels()).toEqual(['C', 'A', 'B']);
  });

  it('deletes only the targeted macro', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
    ];
    render(<Harness />);
    await click(screen.getByLabelText('删除 A'));
    expect(saves.at(-1)).toEqual([{ label: 'B', text: '2' }]);
  });

  it('edits a macro in place, ignoring blank saves, and supports cancel', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
    ];
    render(<Harness />);
    await click(screen.getByLabelText('编辑 B'));
    const [editName] = screen.getAllByLabelText('模板名称');
    const [editText] = screen.getAllByLabelText('模板内容');
    expect((editName as HTMLInputElement).value).toBe('B');

    fireEvent.change(editText, { target: { value: '  ' } });
    await click(screen.getByRole('button', { name: /保存/ }));
    expect(saves).toEqual([]);

    fireEvent.change(editName, { target: { value: ' B2 ' } });
    fireEvent.change(editText, { target: { value: 'two' } });
    await act(async () => {
      fireEvent.keyDown(editText, { key: 'Enter' });
    });
    expect(saves.at(-1)).toEqual([
      { label: 'A', text: '1' },
      { label: 'B2', text: 'two' },
    ]);
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull();

    await click(screen.getByLabelText('编辑 A'));
    await click(screen.getByRole('button', { name: '取消' }));
    expect(saves).toHaveLength(1);
    expect(screen.queryByLabelText('编辑 A')).not.toBeNull();
  });

  it('keeps the edit form attached to the macro being edited when a neighbour moves', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
    ];
    render(<Harness />);
    await click(screen.getByLabelText('编辑 B'));
    // While editing B, its row actions are hidden; move A down instead (B becomes index 0).
    await click(screen.getByLabelText('将 A 下移'));
    expect(labels()).toEqual(['B', 'A']);
    const [editName] = screen.getAllByLabelText('模板名称');
    expect((editName as HTMLInputElement).value).toBe('B');
    // Saving must overwrite B (now index 0), not A.
    fireEvent.change(screen.getAllByLabelText('模板内容')[0], { target: { value: 'edited' } });
    await click(screen.getByRole('button', { name: /保存/ }));
    expect(saves.at(-1)).toEqual([
      { label: 'B', text: 'edited' },
      { label: 'A', text: '1' },
    ]);
  });

  it('keeps editing the same macro when a previous macro is deleted', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
    ];
    render(<Harness />);
    await click(screen.getByLabelText('编辑 B'));
    await click(screen.getByLabelText('删除 A'));
    const [editText] = screen.getAllByLabelText('模板内容');
    fireEvent.change(editText, { target: { value: 'edited' } });
    await click(screen.getByRole('button', { name: /保存/ }));
    expect(saves.at(-1)).toEqual([{ label: 'B', text: 'edited' }]);
  });

  it('keeps editing the same macro when a following neighbour moves up', async () => {
    stored = [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
    ];
    render(<Harness />);
    await click(screen.getByLabelText('编辑 A'));
    await click(screen.getByLabelText('将 B 上移'));
    const [editText] = screen.getAllByLabelText('模板内容');
    fireEvent.change(editText, { target: { value: 'edited' } });
    await click(screen.getByRole('button', { name: /保存/ }));
    expect(saves.at(-1)).toEqual([
      { label: 'B', text: '2' },
      { label: 'A', text: 'edited' },
    ]);
  });

  it('calls onApply with the clicked macro', () => {
    stored = [{ label: 'A', text: '1' }];
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);
    fireEvent.click(screen.getByTitle('使用此模板'));
    expect(onApply.mock.calls).toEqual([[{ label: 'A', text: '1' }]]);
  });
});
