// @vitest-environment happy-dom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { MarketListingEntry } from '@/common/types/pd2-website/GetMarketListingsResponse';
import { usePd2Website } from '@/hooks/pd2website/usePD2Website';
import { ItemsProvider } from '@/hooks/useItems';
import { useOptions, type ISettings } from '@/hooks/useOptions';
import { createOptionsStore, type OptionsStore } from '@/components/dialogs/optionsv2/test-utils';
import type * as Overlay from '@/overlay';
import { findMarketLinks } from '../lib/market-links';
import { pasteText, placeCaret, typeAtCaret, typeDraft } from './composer-test-utils';
import { Composer, type ReplyChannel, type TemplateVars } from './Composer';

vi.mock('@/hooks/pd2website/usePD2Website', () => ({ usePd2Website: vi.fn() }));
vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
const openPanel = vi.hoisted(() => vi.fn());
/** undoToast calls: title and the Undo callback of each toast shown. */
const undoToasts = vi.hoisted(() => [] as { title: string; description?: string; onUndo: () => void }[]);
vi.mock('@/overlay', async (importOriginal) => ({
  ...(await importOriginal<typeof Overlay>()),
  useOverlay: () => ({ openPanel }),
  undoToast: (options: { title: string; description?: string; onUndo: () => void }) => {
    undoToasts.push(options);
    return () => {};
  },
}));
// Market prices of attached listings (their hover popover): none known
vi.mock('@/pages/currency/lib/price-api', () => ({ fetchMultipleItemPrices: vi.fn(async () => new Map()) }));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const VARS: TemplateVars = { accountName: 'AliceAcc', itemName: 'Shako', price: '2 HR' };

let settings: Partial<ISettings>;
/** The settings store, created on first render from `settings` as the test left it. */
let store: OptionsStore | undefined;
let getMarketListings: Mock;
let onSend: Mock;

function Harness({ initial = '', switchable = false }: { initial?: string; switchable?: boolean }) {
  const [value, setValue] = useState(initial);
  const [channel, setChannel] = useState<ReplyChannel>('website');
  return (
    <ItemsProvider items={[]}>
      <Composer
        value={value}
        onChange={setValue}
        onSend={onSend}
        placeholder="Message Alice..."
        templateVars={VARS}
        channel={channel}
        onChannelChange={switchable ? setChannel : undefined}
      />
    </ItemsProvider>
  );
}

const editor = () => screen.getByRole('textbox', { name: '消息' });
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

function type(value: string, caret = value.length) {
  typeDraft(editor(), value, caret);
}

function listing(id: string, name: string, hr_price: number, base = name): MarketListingEntry {
  return {
    _id: id,
    hr_price,
    price: hr_price ? '' : 'offers',
    item: { name, quality: { id: 7, name: 'Unique' }, base: { name: base } },
  } as unknown as MarketListingEntry;
}

beforeEach(() => {
  settings = {
    mode: 'hardcore',
    ladder: 'ladder',
    acceptOfferMessageTemplate: 'Accepted {itemName} for {price}. Game: {gameInfo}',
    rejectOfferMessageTemplate: 'Sorry {accountName}, declined.',
    soldOfferMessageTemplate: 'The {itemName} is sold.',
  };
  store = undefined;
  undoToasts.length = 0;
  onSend = vi.fn();
  openPanel.mockClear();
  getMarketListings = vi.fn(async () => ({
    total: 2,
    limit: 50,
    skip: 0,
    data: [listing('aa11', 'Harlequin Crest', 2.5, 'Shako'), listing('bb22', "Tal Rasha's Guardianship", 0)],
  }));
  vi.mocked(usePd2Website).mockImplementation(
    () => ({ authData: { user: { _id: 'me' } }, getMarketListings }) as unknown as ReturnType<typeof usePd2Website>,
  );
  vi.mocked(useOptions).mockImplementation(() => (store ??= createOptionsStore(settings)).useOptions());
});

afterEach(cleanup);

describe('Composer sending', () => {
  it('sends the trimmed text on Enter and clears the draft', () => {
    render(<Harness />);
    type('  2 ist?  ');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('2 ist?');
    expect(editor().textContent).toBe('');
  });

  it('puts a newline in on Shift+Enter, and does not send blank text', () => {
    render(<Harness />);
    type('line one');
    fireEvent.keyDown(editor(), { key: 'Enter', shiftKey: true });
    typeAtCaret(editor(), 'two');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('line one\ntwo');
    onSend.mockClear();

    type('   ');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores Enter while an IME composition is active', () => {
    render(<Harness />);
    type('にほん');
    expect(fireEvent.keyDown(editor(), { key: 'Enter', isComposing: true })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    expect(editor().textContent).toBe('にほん');
  });

  it('sends with the Send button', () => {
    render(<Harness initial="ty gl" />);
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledWith('ty gl');
  });

  it('offers the Website/Whisper switch only when both reach the person; Whisper sends as a copied whisper', () => {
    const { unmount } = render(<Harness initial="hi" />);
    expect(screen.queryByRole('group', { name: '回复方式' })).toBeNull();
    unmount();

    render(<Harness initial="hi"
      switchable />);
    const via = screen.getByRole('group', { name: '回复方式' });
    expect(
      within(via)
        .getByRole('radio', { name: /网站消息/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(within(via).getByRole('radio', { name: /游戏密语/ }));
    expect(
      within(via)
        .getByRole('radio', { name: /游戏密语/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '复制游戏密语' }));
    expect(onSend).toHaveBeenCalledWith('hi');
  });
});

describe('Composer templates', () => {
  const NEW = '新建模板';
  const MANAGE = '管理模板…';

  it('opens on "/" with the labelled templates filled in, filters as you type and inserts on Enter', () => {
    render(<Harness />);
    type('/');
    expect(options()).toEqual([
      '已接受报价 / Offer acceptedAccepted Shako for 2 HR. Game: ',
      '已拒绝报价 / Offer declinedSorry AliceAcc, declined.',
      '物品已售出 / Item soldThe Shako is sold.',
      NEW,
      MANAGE,
    ]);

    type('/sold');
    expect(options()).toEqual(['物品已售出 / Item soldThe Shako is sold.', NEW, MANAGE]);
    fireEvent.keyDown(editor(), { key: 'Enter' });

    expect(editor().textContent).toBe('The Shako is sold.');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves the choice with the arrow keys and picks with Tab', () => {
    render(<Harness />);
    type('/');
    fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    fireEvent.keyDown(editor(), { key: 'ArrowUp' });
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('Item sold');
    // Down past "Manage templates…" wraps to the top
    for (let i = 0; i < 3; i++) fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(editor().textContent).toBe('Accepted Shako for 2 HR. Game: ');
  });

  it('closes on Escape, and only offers templates the user has set', () => {
    settings.rejectOfferMessageTemplate = '';
    render(<Harness />);
    type('/');
    expect(options()).toHaveLength(4);
    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor().textContent).toBe('/');

    type('/x');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it("lists the user's own templates first, filled from the thread, filtered by name or text", () => {
    settings.chatTemplates = [
      { id: 'a', name: 'Still available?', text: 'Hi, is your {itemName} still available?' },
      { id: 'b', name: 'Haggle', text: 'Would you take {price}, {accountName}?' },
      { id: 'c', name: 'Blank', text: '   ' },
    ];
    render(<Harness />);
    type('/');
    expect(options()).toEqual([
      'Still available?Hi, is your Shako still available?',
      'HaggleWould you take 2 HR, AliceAcc?',
      '已接受报价 / Offer acceptedAccepted Shako for 2 HR. Game: ',
      '已拒绝报价 / Offer declinedSorry AliceAcc, declined.',
      '物品已售出 / Item soldThe Shako is sold.',
      NEW,
      MANAGE,
    ]);

    // By name
    type('/hag');
    expect(options()).toEqual(['HaggleWould you take 2 HR, AliceAcc?', NEW, MANAGE]);
    // By (filled) text
    type('/aliceacc');
    expect(options()).toEqual([
      'HaggleWould you take 2 HR, AliceAcc?',
      '已拒绝报价 / Offer declinedSorry AliceAcc, declined.',
      NEW,
      MANAGE,
    ]);
    fireEvent.click(screen.getByRole('option', { name: /Haggle/ }));
    expect(editor().textContent).toBe('Would you take 2 HR, AliceAcc?');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('"Manage templates…" opens Settings on the Chat section and drops the "/"', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('option', { name: MANAGE }));
    expect(openPanel).toHaveBeenCalledWith('settings', { section: 'Chat' }, { focus: true });
    expect(editor().textContent).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('offers "New template" and "Manage templates…" on "/" even without any templates, also by keyboard', () => {
    settings = { mode: 'hardcore', ladder: 'ladder', chatTemplates: [] };
    render(<Harness />);
    type('/');
    expect(options()).toEqual([NEW, MANAGE]);
    expect(screen.queryByText('暂无模板')).not.toBeNull();
    fireEvent.keyDown(editor(), { key: 'ArrowUp' });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(openPanel).toHaveBeenCalledWith('settings', { section: 'Chat' }, { focus: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Composer template management', () => {
  const HAGGLE = { id: 'b', name: 'Haggle', text: 'Would you take {price}, {accountName}?' };
  const MINE = [{ id: 'a', name: 'Still available?', text: 'Is your {itemName} still available?' }, HAGGLE];
  const savedTemplates = () => store!.updateSettings.mock.calls.at(-1)?.[0].chatTemplates;
  const form = (name: string) => screen.getByRole('form', { name });
  const nameInput = () => screen.getByLabelText('名称') as HTMLInputElement;
  const textInput = () => screen.getByLabelText('消息', { selector: 'textarea' }) as HTMLTextAreaElement;
  const ctrl = (key: string) => fireEvent.keyDown(editor(), { key, ctrlKey: true });

  beforeEach(() => {
    settings.chatTemplates = MINE;
  });

  it('creates a template from the menu: it is saved, listed and the message gets the keyboard back', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('option', { name: '新建模板' }));
    // The form replaces the list; the menu stays open
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(nameInput());

    fireEvent.change(nameInput(), { target: { value: 'Thanks' } });
    fireEvent.change(textInput(), { target: { value: 'ty {accountName}, gl' } });
    fireEvent.click(within(form('新建模板')).getByRole('button', { name: '添加模板' }));

    expect(savedTemplates()).toEqual([
      ...MINE,
      { id: expect.any(String), name: 'Thanks', text: 'ty {accountName}, gl' },
    ]);
    expect(options()).toContain('Thanksty AliceAcc, gl');
    expect(document.activeElement).toBe(editor());
    expect(editor().textContent).toBe('/');
  });

  it('validates the form like Settings does, and inserts token chips at the caret', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('option', { name: '新建模板' }));
    fireEvent.click(within(form('新建模板')).getByRole('button', { name: '添加模板' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      '请填写模板名称',
      '请填写消息内容',
    ]);
    expect(store!.updateSettings).not.toHaveBeenCalled();

    fireEvent.change(textInput(), { target: { value: 'Hi  there' } });
    textInput().setSelectionRange(3, 3);
    fireEvent.click(within(form('新建模板')).getByRole('button', { name: '{accountName}' }));
    expect(textInput().value).toBe('Hi {accountName} there');
  });

  it('edits a template in the menu with its pencil; Ctrl+Enter saves', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('button', { name: '编辑模板：Haggle' }));
    expect(nameInput().value).toBe('Haggle');
    expect(textInput().value).toBe('Would you take {price}, {accountName}?');
    fireEvent.change(textInput(), { target: { value: 'I can do {price}' } });
    fireEvent.keyDown(textInput(), { key: 'Enter', ctrlKey: true });

    expect(savedTemplates()).toEqual([MINE[0], { ...HAGGLE, text: 'I can do {price}' }]);
    expect(options()).toContain('HaggleI can do 2 HR');
    expect(document.activeElement).toBe(editor());
  });

  it('edits an offer template in place: only its text', () => {
    render(<Harness />);
    type('/declined');
    fireEvent.click(screen.getByRole('button', { name: '编辑模板：已拒绝报价 / Offer declined' }));
    expect(screen.queryByLabelText('名称')).toBeNull();
    expect(textInput().value).toBe('Sorry {accountName}, declined.');
    fireEvent.change(textInput(), { target: { value: 'No thanks {accountName}' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(store!.updateSettings).toHaveBeenLastCalledWith({ rejectOfferMessageTemplate: 'No thanks {accountName}' });
    expect(options()).toContain('已拒绝报价 / Offer declinedNo thanks AliceAcc');
  });

  it('deletes a template right away, and Undo puts it back where it was', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('button', { name: '删除模板：Still available?' }));
    expect(savedTemplates()).toEqual([HAGGLE]);
    expect(options()).not.toContain('Still available?Is your Shako still available?');
    expect(screen.queryByRole('button', { name: '删除模板：已拒绝报价 / Offer declined' })).toBeNull();

    expect(undoToasts).toEqual([
      expect.objectContaining({ title: '模板已删除', description: '已删除模板“Still available?”。' }),
    ]);
    act(() => undoToasts[0].onUndo());
    expect(savedTemplates()).toEqual(MINE);
    expect(options()[0]).toBe('Still available?Is your Shako still available?');
  });

  it('works from the keyboard: arrows choose, Ctrl+E edits, Esc goes back to the list, Ctrl+D deletes', () => {
    render(<Harness />);
    type('/');
    fireEvent.keyDown(editor(), { key: 'ArrowDown' });
    expect(screen.getByText(/Ctrl\+E 编辑 · Ctrl\+D 删除/)).toBeTruthy();

    ctrl('e');
    expect(nameInput().value).toBe('Haggle');
    // Esc leaves the form for the list (not the conversation), the message has the keyboard again
    const esc = fireEvent.keyDown(nameInput(), { key: 'Escape' });
    expect(esc).toBe(false);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(document.activeElement).toBe(editor());
    expect(store!.updateSettings).not.toHaveBeenCalled();

    // Still filtering as you type after "/"
    type('/hag');
    expect(options()[0]).toBe('HaggleWould you take 2 HR, AliceAcc?');
    ctrl('d');
    expect(savedTemplates()).toEqual([MINE[0]]);

    // The offer templates have no delete
    type('/sold');
    ctrl('d');
    expect(store!.updateSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ctrl\+E 编辑$/)).toBeTruthy();
  });

  it('saves the message being written as a template, links kept as their URLs', async () => {
    const url = 'https://www.projectdiablo2.com/market/listing/aa11?display="Harlequin Crest"';
    render(<Harness initial={`wts ${url} 2 HR`} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    // Not a "/" search: every template, plus saving the draft
    expect(options().slice(-3)).toEqual(['将消息保存为模板', '新建模板', '管理模板…']);
    fireEvent.click(screen.getByRole('option', { name: '将消息保存为模板' }));

    expect(textInput().value).toBe(`wts ${url} 2 HR`);
    fireEvent.change(nameInput(), { target: { value: 'WTS shako' } });
    // Enter in the name submits the form
    fireEvent.submit(form('将消息保存为模板'));

    expect(savedTemplates()?.at(-1)).toEqual({ id: expect.any(String), name: 'WTS shako', text: `wts ${url} 2 HR` });
    // The draft is untouched
    fireEvent.keyDown(editor(), { key: 'Escape' });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith(`wts ${url} 2 HR`);
  });

  it('the Templates button inserts a template at the caret, and closes when typing goes on', () => {
    render(<Harness />);
    type('hi  pls', 3);
    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    fireEvent.click(screen.getByRole('option', { name: /Item sold/ }));
    expect(editor().textContent).toBe('hi The Shako is sold. pls');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    typeAtCaret(editor(), 'x');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Composer template placeholders', () => {
  const fields = () =>
    within(screen.getByRole('form', { name: /^填写模板：/ })).getAllByRole('textbox') as HTMLInputElement[];
  const labels = () => fields().map((f) => f.getAttribute('aria-label'));
  const preview = () => screen.getByLabelText('消息预览').textContent;
  const fill = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

  it('asks for the custom placeholders first, deduped in order, with a live preview; Enter walks to the end', () => {
    settings.chatTemplates = [
      { id: 'g', name: 'Game', text: '{itemName} is yours, join {game} / { pw }, {game}!' },
      { id: 'h', name: 'Hi', text: 'hi {accountName}' },
    ];
    render(<Harness />);
    type('/game');
    fireEvent.keyDown(editor(), { key: 'Enter' });

    // Not inserted yet: the menu shows the fill-in form instead of the list
    expect(editor().textContent).toBe('/game');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(labels()).toEqual(['game', 'pw']);
    expect(document.activeElement).toBe(fields()[0]);
    expect(preview()).toBe('Shako is yours, join  / , !');
    expect(screen.getByText(/以下字段留空时将插入空内容：\{game\} \{pw\}/)).toBeTruthy();

    fill(fields()[0], 'Baal-12 {price}');
    expect(preview()).toBe('Shako is yours, join Baal-12 {price} / , Baal-12 {price}!');
    fireEvent.keyDown(fields()[0], { key: 'Enter' });
    expect(document.activeElement).toBe(fields()[1]);
    fill(fields()[1], '1');
    expect(screen.queryByText(/以下字段留空时将插入空内容/)).toBeNull();
    fireEvent.keyDown(fields()[1], { key: 'Enter' });

    // Values go in literally
    expect(editor().textContent).toBe('Shako is yours, join Baal-12 {price} / 1, Baal-12 {price}!');
    expect(screen.queryByRole('form')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Esc goes back to the list without inserting; templates without placeholders go in right away', () => {
    settings.chatTemplates = [
      { id: 'r', name: 'Room', text: 'come to {room}' },
      { id: 'h', name: 'Hi', text: 'hi {accountName}' },
    ];
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('option', { name: /Room/ }));
    const esc = fireEvent.keyDown(fields()[0], { key: 'Escape' });
    expect(esc).toBe(false);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(document.activeElement).toBe(editor());
    expect(editor().textContent).toBe('/');

    fireEvent.click(screen.getByRole('option', { name: /^Hi/ }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(editor().textContent).toBe('hi AliceAcc');
  });

  it('remembers the answers for the session and offers them again', () => {
    settings.chatTemplates = [
      { id: 'a', name: 'Join', text: 'join {lobby}/{secret}' },
      { id: 'b', name: 'Rejoin', text: 'back in {lobby} ({secret})' },
    ];
    render(<Harness />);
    type('/join');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    fill(fields()[0], 'baal-7');
    fill(fields()[1], 'x');
    fireEvent.click(screen.getByRole('button', { name: '插入消息' }));
    expect(editor().textContent).toBe('join baal-7/x');

    type('/rejoin');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(fields().map((f) => f.value)).toEqual(['baal-7', 'x']);
    expect(preview()).toBe('back in baal-7 (x)');
  });

  it('from the Templates button the filled message goes in at the caret; Ctrl+Enter inserts from any field', () => {
    settings.chatTemplates = [{ id: 'a', name: 'Pw', text: 'pw {passcode} {spot}' }];
    render(<Harness />);
    type('ok  ty', 3);
    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    fireEvent.click(screen.getByRole('option', { name: /^Pw/ }));
    fill(fields()[0], '42');
    fireEvent.keyDown(fields()[0], { key: 'Enter', ctrlKey: true });
    expect(editor().textContent).toBe('ok pw 42  ty');
  });

  it('shows the placeholders a template will ask for while it is written', () => {
    render(<Harness />);
    type('/');
    fireEvent.click(screen.getByRole('option', { name: '新建模板' }));
    expect(screen.getByText(/使用模板时会询问其他 \{name\} 占位内容/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('消息', { selector: 'textarea' }), {
      target: { value: 'join {game} {itemName} {pw} {game}' },
    });
    expect(screen.getByText(/使用时询问：/).textContent?.replace(/\s+/g, ' ').trim()).toBe('使用时询问： {game} {pw}');
  });
});

describe('Composer starred templates', () => {
  const STARRED = [
    { id: 'a', name: 'Still available?', text: 'Hi, is your {itemName} still available?', favorite: true },
    { id: 'p', name: 'Price check', text: 'Would you take {price}?' },
    { id: 'i', name: 'Inv me', text: 'Sure, inv me.', favorite: true },
    { id: 'g', name: 'Game', text: 'join {room}', favorite: true },
  ];
  const row = () => screen.getByRole('toolbar', { name: '快捷回复' });
  const chips = () =>
    within(row())
      .queryAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t && t !== '/');
  const savedTemplates = () => store!.updateSettings.mock.calls.at(-1)?.[0].chatTemplates;

  beforeEach(() => {
    settings.chatTemplates = STARRED;
  });

  it('shows the starred templates as chips, in template order; a chip inserts its filled text at the caret', () => {
    render(<Harness />);
    expect(chips()).toEqual(['Still available?', 'Inv me', 'Game']);
    type('ok  ty', 3);
    fireEvent.click(within(row()).getByRole('button', { name: 'Still available?' }));
    expect(editor().textContent).toBe('ok Hi, is your Shako still available? ty');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a chip with placeholders asks for them first', () => {
    render(<Harness />);
    type('hey');
    fireEvent.click(within(row()).getByRole('button', { name: 'Game' }));
    const field = screen.getByLabelText('room') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'baal-3' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(editor().textContent).toBe('hey join baal-3');
  });

  it('stars a template from the "/" menu (click or Ctrl+S), offer templates too, and shows its chip', () => {
    render(<Harness />);
    type('/price');
    expect(screen.getByRole('button', { name: '收藏模板：Price check' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '收藏模板：Price check' }));
    expect(savedTemplates()?.[1]).toEqual({ ...STARRED[1], favorite: true });
    expect(chips()).toEqual(['Still available?', 'Price check', 'Inv me', 'Game']);
    expect(screen.getByRole('button', { name: '取消收藏模板：Price check' }).getAttribute('aria-pressed')).toBe('true');

    type('/sold');
    expect(screen.getByText(/Ctrl\+S 收藏/)).toBeTruthy();
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true });
    expect(store!.updateSettings).toHaveBeenLastCalledWith({ favoriteOfferTemplates: ['soldOfferMessageTemplate'] });
    expect(chips()).toEqual(['Still available?', 'Price check', 'Inv me', 'Game', '物品已售出 / Item sold']);
    fireEvent.keyDown(editor(), { key: 's', ctrlKey: true });
    expect(store!.updateSettings).toHaveBeenLastCalledWith({ favoriteOfferTemplates: [] });
  });

  it('without starred templates the row only explains how to pin some', () => {
    settings.chatTemplates = [STARRED[1]];
    render(<Harness />);
    expect(chips()).toEqual([]);
    expect(within(row()).getByText('★ 收藏模板后会固定显示在这里')).toBeTruthy();
  });
});

describe('Composer listing picker', () => {
  async function openPicker() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '关联我的一条挂单' }));
    });
    await act(async () => {});
    return screen.getByRole('dialog');
  }

  it("lists the user's active listings in their realm with price, searchable by name", async () => {
    render(<Harness />);
    const picker = await openPicker();

    expect(getMarketListings).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'me', is_hardcore: true, is_ladder: true, $limit: 50, $skip: 0 }),
    );
    const items = () =>
      within(picker)
        .queryAllByRole('button')
        .map((b) => b.textContent);
    expect(items()).toEqual(['谐角之冠军帽2.5 HR', "Tal Rasha's Guardianshipoffers"]);

    fireEvent.change(within(picker).getByPlaceholderText('搜索我的挂单…'), { target: { value: 'tal' } });
    expect(items()).toEqual(["Tal Rasha's Guardianshipoffers"]);
  });

  const URL = 'https://www.projectdiablo2.com/market/listing/aa11?display="Harlequin Crest"';
  /** The pill of a listing inside the editor. */
  const pill = (name: string) => within(editor()).queryByText(name);
  /** Lets the linked listings' lookup settle. */
  const settle = () => act(async () => {});
  const sendNow = () => fireEvent.keyDown(editor(), { key: 'Enter' });

  it('links a picked listing inline at the caret, as a pill, sending its link in that place', async () => {
    render(<Harness />);
    type('want this? ok', 10);
    const picker = await openPicker();
    await act(async () => {
      fireEvent.click(within(picker).getByRole('button', { name: /谐角之冠/ }));
    });
    await settle();

    expect(pill('谐角之冠')).not.toBeNull();
    expect(editor().textContent).toBe('want this? 谐角之冠 ok');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();

    sendNow();
    expect(onSend).toHaveBeenCalledWith(`want this? ${URL} ok`);
    expect(findMarketLinks(onSend.mock.calls[0][0])).toEqual([
      expect.objectContaining({ listingId: 'aa11', displayName: 'Harlequin Crest', url: URL }),
    ]);
    expect(editor().textContent).toBe('');
  });

  it('removes a whole link with Backspace after its pill, or with its ×', async () => {
    const { unmount } = render(<Harness initial={`hi ${URL}`} />);
    await settle();
    expect(editor().textContent).toBe('hi 谐角之冠');
    editor().focus();
    placeCaret(editor(), editor().childNodes.length);
    fireEvent.keyDown(editor(), { key: 'Backspace' });
    expect(pill('谐角之冠')).toBeNull();
    sendNow();
    expect(onSend).toHaveBeenLastCalledWith('hi');
    unmount();

    render(<Harness initial={`hi ${URL} there`} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '移除 Harlequin Crest' }));
    expect(pill('谐角之冠')).toBeNull();
    sendNow();
    expect(onSend).toHaveBeenLastCalledWith('hi  there');
  });

  it('turns a listing link pasted mid-text into an inline pill', async () => {
    render(<Harness />);
    type('look here', 5);
    pasteText(editor(), `${URL} `);
    await settle();
    expect(editor().textContent).toBe('look 谐角之冠 here');
    expect(editor().textContent).not.toContain('https');
    sendNow();
    expect(onSend).toHaveBeenCalledWith(`look ${URL} here`);
  });

  it('keeps pills in place while typing around them', async () => {
    render(<Harness initial={URL} />);
    await settle();
    editor().focus();
    placeCaret(editor(), editor().childNodes.length);
    typeAtCaret(editor(), ' for 2 ist');
    placeCaret(editor(), 0);
    typeAtCaret(editor(), 'wts ');
    expect(editor().textContent).toBe('wts 谐角之冠 for 2 ist');
    sendNow();
    expect(onSend).toHaveBeenCalledWith(`wts ${URL} for 2 ist`);
  });

  it('sends a space between a link and text typed right against its pill', async () => {
    render(<Harness initial={`look${URL}hello`} />);
    await settle();
    sendNow();
    expect(onSend).toHaveBeenCalledWith(`look ${URL} hello`);
  });
});

describe('中文模板菜单焦点', () => {
  it('keeps overlay keyboard while opening the new-template form', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    const option = screen.getByRole('option', { name: '新建模板' });
    expect(option.closest('[data-keep-overlay-keyboard]')).not.toBeNull();
    fireEvent.pointerDown(option);
    fireEvent.blur(screen.getByRole('textbox', { name: '消息' }), { relatedTarget: null });
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(screen.getByRole('form', { name: '新建模板' })).toBeTruthy();
  });
  it('opens chat settings in front with focus when managing templates', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '消息模板' }));
    const option = screen.getByRole('option', { name: '管理模板…' });
    expect(option.closest('[data-keep-overlay-keyboard]')).not.toBeNull();
    fireEvent.pointerDown(option);
    fireEvent.blur(screen.getByRole('textbox', { name: '消息' }), { relatedTarget: null });
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(openPanel).toHaveBeenCalledWith('settings', { section: 'Chat' }, { focus: true });
  });
});

it('keeps keyboard ownership when opening or using favorite templates after returning to the game', () => {
  settings.chatTemplates = [{ id: 'x', name: 'Quick reply', text: 'Still available?', favorite: true }];
  render(<Harness />);
  const toggle = screen.getByRole('button', { name: '消息模板' });
  expect(toggle.closest('[data-keep-overlay-keyboard]')).not.toBeNull();
  const favorite = screen.getByRole('button', { name: 'Quick reply' });
  expect(favorite.closest('[data-keep-overlay-keyboard]')).not.toBeNull();
  fireEvent.pointerDown(toggle);
  fireEvent.mouseDown(toggle);
  fireEvent.click(toggle);
  const choice = screen.getByRole('option', { name: /Quick reply/ });
  fireEvent.pointerDown(choice);
  // A native focus transition can blur the editor between pointerdown and click.
  fireEvent.blur(screen.getByRole('textbox', { name: '消息' }), { relatedTarget: null });
  expect(screen.getByRole('option', { name: /Quick reply/ })).toBeTruthy();
  fireEvent.mouseDown(choice);
  fireEvent.click(choice);
  expect(screen.getByRole('textbox', { name: '消息' }).textContent).toContain('Still available?');
});


describe('一键复制询问', () => {
  it('优先询问草稿中关联的物品，不清空草稿', () => {
    const onChange = vi.fn();
    // Keep this URL-only fixture independent of cached market listings from the picker tests.
    vi.mocked(usePd2Website).mockReturnValue({ authData: null } as never);
    render(<ItemsProvider items={[]}><Composer value="https://projectdiablo2.com/market/listing/cc33?display=Ruby%20Jewel" onChange={onChange} onSend={onSend} placeholder="消息" templateVars={VARS} channel="whisper" whisperTarget="AliceAcc" /></ItemsProvider>);
    fireEvent.click(screen.getByRole('button', { name: '一键复制询问' }));
    expect(onSend).toHaveBeenCalledWith('Hi, is your Ruby Jewel still available?');
    expect(screen.getByRole('textbox', { name: '消息' }).textContent).toContain('Ruby Jewel');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('没有关联物品时使用通用询问', () => {
    render(<ItemsProvider items={[]}><Composer value="" onChange={vi.fn()} onSend={onSend} placeholder="消息" templateVars={{}} channel="whisper" whisperTarget="AliceAcc" /></ItemsProvider>);
    fireEvent.click(screen.getByRole('button', { name: '一键复制询问' }));
    expect(onSend).toHaveBeenCalledWith('Hi, is your item still available?');
  });
});
