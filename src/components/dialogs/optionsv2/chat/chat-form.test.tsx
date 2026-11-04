// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { NOTIFICATION_SOUND_PRESETS } from '@/lib/bundled-notification-sounds';
import { useOptions } from '@/hooks/useOptions';
import type { ISettings } from '@/hooks/useOptions';
import { createOptionsStore, type OptionsStore } from '../test-utils';
import { ChatForm } from './chat-form';

vi.mock('@/hooks/useOptions', () => ({ useOptions: vi.fn() }));
// vi.mock factories are hoisted above static imports, so the shim must be loaded inside the factory.
vi.mock('@/components/ui/select', async () => (await import('../test-utils')).selectShim);

let store: OptionsStore;

function renderForm(settings: Partial<ISettings> = {}, isLoading = false) {
  store = createOptionsStore(settings, isLoading);
  vi.mocked(useOptions).mockImplementation(store.useOptions);
  return render(<ChatForm />);
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const lastSaved = () => store.updateSettings.mock.calls.at(-1)?.[0];
const ignoreInput = () => screen.getByPlaceholderText('输入要忽略的玩家名称') as HTMLInputElement;
const addIgnored = (name: string) => {
  fireEvent.change(ignoreInput(), { target: { value: name } });
  fireEvent.keyDown(ignoreInput(), { key: 'Enter' });
};
const chips = () =>
  screen.queryAllByRole('button', { name: /^移除 / }).map((b) => b.getAttribute('aria-label')!.slice(3));
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

describe('ChatForm', () => {
  it('shows a skeleton while loading', () => {
    renderForm({}, true);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('applies defaults for unset settings', () => {
    renderForm({});
    expect(screen.getByRole('switch', { name: '常规通知' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: '玩家加入通知' }).getAttribute('aria-checked')).toBe('false');
    expect((screen.getByLabelText('通知时机') as HTMLSelectElement).value).toBe('both');
    expect(screen.getByText(/^通知音量：/).textContent).toContain('70%');
  });

  it('debounces a toggle into a single save', async () => {
    renderForm({});
    fireEvent.click(screen.getByRole('switch', { name: '交易通知' }));
    await advance(499);
    expect(store.updateSettings).not.toHaveBeenCalled();
    await advance(1);
    expect(store.updateSettings).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toMatchObject({ tradeNotificationsEnabled: false, whisperNotificationsEnabled: true });
  });

  it('does not add sound effects to ordinary interface controls', async () => {
    const audio = vi.fn();
    vi.stubGlobal('Audio', audio);
    try {
      renderForm({});
      fireEvent.click(screen.getByRole('switch', { name: '交易通知' }));
      await advance(500);
      expect(audio).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('"Never" disables every notification control and explains why', async () => {
    renderForm({});
    fireEvent.change(screen.getByLabelText('通知时机'), { target: { value: 'never' } });
    expect(screen.queryByText(/通知已关闭/)).not.toBeNull();
    for (const name of ['常规通知', '弹出通知', '交易通知', '玩家加入通知']) {
      expect((screen.getByRole('switch', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(ignoreInput().disabled).toBe(true);
    await advance(500);
    // Toast type chips are hidden while muted (after the exit transition)
    expect(screen.queryByRole('group', { name: '弹出通知类型' })).toBeNull();
    expect(lastSaved()?.whisperNotificationTiming).toBe('never');
  });

  it('adds ignored players trimmed and lower-cased, skipping duplicates', async () => {
    renderForm({ whisperIgnoreList: ['bob'] });
    addIgnored('  Alice ');
    expect(chips()).toEqual(['bob', 'alice']);
    expect(ignoreInput().value).toBe('');

    addIgnored('BOB');
    expect(chips()).toEqual(['bob', 'alice']);
    // A rejected duplicate stays in the box so the user can see what happened
    expect(ignoreInput().value).toBe('BOB');

    await advance(500);
    expect(lastSaved()?.whisperIgnoreList).toEqual(['bob', 'alice']);
  });

  it('only enables Add when there is a non-blank name', () => {
    renderForm({});
    const add = screen.getByRole('button', { name: '添加' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(ignoreInput(), { target: { value: '   ' } });
    expect(add.disabled).toBe(true);
    fireEvent.change(ignoreInput(), { target: { value: 'Zed' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(chips()).toEqual(['zed']);
  });

  it('removes an ignored player', async () => {
    renderForm({ whisperIgnoreList: ['bob', 'carl'] });
    fireEvent.click(screen.getByRole('button', { name: '移除 bob' }));
    await advance(500);
    expect(lastSaved()?.whisperIgnoreList).toEqual(['carl']);
  });

  it('toggles toast popup types, and hides them when toast popups are off', async () => {
    renderForm({ toastPopupTypes: ['whispers', 'trade'] });
    const group = screen.getByRole('group', { name: '弹出通知类型' });
    const pressed = () =>
      within(group)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
    expect(pressed()).toEqual(['密语', '交易']);

    fireEvent.click(within(group).getByRole('button', { name: '密语' }));
    fireEvent.click(within(group).getByRole('button', { name: '报价' }));
    expect(pressed()).toEqual(['交易', '报价']);
    await advance(500);
    expect(lastSaved()?.toastPopupTypes).toEqual(['trade', 'offers']);

    fireEvent.click(screen.getByRole('switch', { name: '弹出通知' }));
    await advance(100);
    expect(screen.queryByRole('group', { name: '弹出通知类型' })).toBeNull();
  });

  it('inserts a placeholder token at the end of the template', async () => {
    renderForm({ rejectOfferMessageTemplate: 'No thanks ' });
    const input = screen.getByLabelText('拒绝报价消息模板') as HTMLInputElement;
    const row = input.closest('[data-slot="form-item"]') ?? input.parentElement!.parentElement!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '{accountName}' }));
    expect(input.value).toBe('No thanks {accountName}');
    await advance(500);
    expect(lastSaved()?.rejectOfferMessageTemplate).toBe('No thanks {accountName}');
  });

  it('steps the volume with the keyboard', async () => {
    renderForm({ whisperNotificationVolume: 0 });
    expect(screen.getByText(/^通知音量：/).textContent).toContain('0%');
    fireEvent.keyDown(screen.getAllByRole('slider')[0], { key: 'ArrowRight' });
    expect(screen.getByText(/^通知音量：/).textContent).toContain('1%');
    await advance(500);
    expect(lastSaved()?.whisperNotificationVolume).toBe(1);
  });

  it('offers separate sound selection, reset and preview for chat and market alerts', () => {
    renderForm({});
    for (const name of ['聊天提示音', '市场提醒音效']) {
      expect(screen.getByLabelText(`选择${name}`)).toBeTruthy();
      expect(screen.getByRole('button', { name: `试听${name}` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `恢复默认${name}` })).toBeTruthy();
      const select = screen.getByLabelText(`${name}选项`) as HTMLSelectElement;
      expect(select.value).toBe('preset:action');
      expect(within(select).queryByRole('option', { name: '默认提示音' })).toBeNull();
    }
  });

  it('previews the chat sound when adjusting its volume', async () => {
    const played: number[] = [];
    const created: FakeAudio[] = [];
    class FakeAudio {
      volume = 1;
      paused = true;
      ended = false;
      constructor() { created.push(this); }
      play() { this.paused = false; played.push(this.volume); return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    vi.stubGlobal('Audio', FakeAudio);
    try {
      renderForm({ whisperNotificationVolume: 50 });
      await act(async () => fireEvent.keyDown(screen.getAllByRole('slider')[0], { key: 'ArrowRight' }));
      expect(played).toEqual([0.51]);
      await act(async () => fireEvent.keyDown(screen.getAllByRole('slider')[0], { key: 'ArrowRight' }));
      expect(created).toHaveLength(1);
      expect(created[0].volume).toBe(0.52);
      fireEvent.click(screen.getByRole('button', { name: '停止试听聊天提示音' }));
      expect(created[0].paused).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('imports and restores a custom chat sound without changing the market sound', async () => {
    const played: string[] = [];
    vi.stubGlobal('Audio', class {
      volume = 1;
      paused = true;
      ended = false;
      constructor(public src: string) {}
      play() { this.paused = false; played.push(this.src); return Promise.resolve(); }
      pause() { this.paused = true; }
    });
    vi.stubGlobal('FileReader', class {
      result = 'data:audio/mpeg;base64,Y2hhdA==';
      onload: (() => void) | null = null;
      readAsDataURL() { this.onload?.(); }
    });
    try {
      renderForm({});
      await act(async () => fireEvent.change(screen.getByLabelText('选择聊天提示音'), {
        target: { files: [new File(['chat'], 'hello.mp3', { type: 'audio/mpeg' })] },
      }));
      expect(screen.getByText('hello.mp3')).toBeTruthy();
      expect((screen.getByLabelText('聊天提示音选项') as HTMLSelectElement).value).toBe('custom');
      expect(played.at(-1)).toBe('data:audio/mpeg;base64,Y2hhdA==');
      expect((screen.getByRole('button', { name: '恢复默认市场提醒音效' }) as HTMLButtonElement).disabled).toBe(true);

      await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢复默认聊天提示音' })));
      expect((screen.getByLabelText('聊天提示音选项') as HTMLSelectElement).value).toBe('preset:action');
      expect(played.at(-1)).not.toBe('data:audio/mpeg;base64,Y2hhdA==');
      await act(async () => fireEvent.change(screen.getByLabelText('聊天提示音选项'), { target: { value: 'custom' } }));
      expect((screen.getByLabelText('聊天提示音选项') as HTMLSelectElement).value).toBe('custom');
      expect(played.at(-1)).toBe('data:audio/mpeg;base64,Y2hhdA==');
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢复默认聊天提示音' })));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('explains an invalid selection and preserves the existing audio choice', async () => {
    renderForm({});
    await act(async () => fireEvent.change(screen.getByLabelText('选择市场提醒音效'), {
      target: { files: [new File(['not audio'], 'not-a-sound.txt')] },
    }));
    expect(screen.getByRole('alert').textContent).toContain('请选择 MP3、WAV 或 OGG');
    expect((screen.getByRole('button', { name: '恢复默认市场提醒音效' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers all five built-in sounds separately for chat and market and remembers both selections', async () => {
    const played: string[] = [];
    vi.stubGlobal('Audio', class {
      volume = 1;
      paused = true;
      ended = false;
      constructor(public src: string) {}
      play() { this.paused = false; played.push(this.src); return Promise.resolve(); }
      pause() { this.paused = true; }
    });
    try {
      renderForm({});
      const chat = screen.getByLabelText('聊天提示音选项') as HTMLSelectElement;
      const market = screen.getByLabelText('市场提醒音效选项') as HTMLSelectElement;
      for (const preset of NOTIFICATION_SOUND_PRESETS) {
        expect(within(chat).getByRole('option', { name: preset.name })).toBeTruthy();
        expect(within(market).getByRole('option', { name: preset.name })).toBeTruthy();
      }
      await act(async () => fireEvent.change(chat, { target: { value: 'preset:interface-back' } }));
      expect(played.at(-1)).toBe(NOTIFICATION_SOUND_PRESETS[0].source);
      await act(async () => fireEvent.change(market, { target: { value: 'preset:in-game-choice' } }));
      expect(played.at(-1)).toBe(NOTIFICATION_SOUND_PRESETS[4].source);
      cleanup();
      await act(async () => { renderForm({}); });
      expect((screen.getByLabelText('聊天提示音选项') as HTMLSelectElement).value).toBe('preset:interface-back');
      expect((screen.getByLabelText('市场提醒音效选项') as HTMLSelectElement).value).toBe('preset:in-game-choice');
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢复默认聊天提示音' })));
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '恢复默认市场提醒音效' })));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('turns the market alert sound off and dims its volume', async () => {
    renderForm({ marketAlertSoundEnabled: true, marketAlertVolume: 70 });
    expect(screen.getByText(/^市场提醒音量：/).textContent).toContain('70%');
    fireEvent.click(screen.getByRole('switch', { name: '市场提醒音效' }));
    await advance(500);
    expect(lastSaved()?.marketAlertSoundEnabled).toBe(false);
    expect(screen.getAllByRole('slider')[1].getAttribute('data-disabled')).not.toBeNull();
  });

  it('does not save when settings change externally', async () => {
    // Real settings are always merged with defaults, so every chat field is present.
    const full: Partial<ISettings> = {
      whisperNotificationsEnabled: true,
      toastPopupsEnabled: true,
      toastPopupTypes: ['whispers'],
      tradeNotificationsEnabled: true,
      whisperIgnoreList: [],
      whisperAnnouncementsEnabled: false,
      whisperJoinNotificationsEnabled: false,
      whisperNotificationTiming: 'both',
      whisperNotificationVolume: 70,
      marketAlertSoundEnabled: true,
      marketAlertVolume: 70,
      acceptOfferMessageTemplate: 'a',
      rejectOfferMessageTemplate: 'r',
      soldOfferMessageTemplate: 's',
    };
    renderForm(full);
    act(() => store.replace({ ...full, tradeNotificationsEnabled: false, whisperIgnoreList: ['x'] }));
    await advance(600);
    expect(screen.getByRole('switch', { name: '交易通知' }).getAttribute('aria-checked')).toBe('false');
    expect(chips()).toEqual(['x']);
    expect(store.updateSettings).not.toHaveBeenCalled();
  });
});

describe('ChatForm message templates', () => {
  const MINE = [
    { id: 'a', name: 'Still available?', text: 'Is your {itemName} still available?' },
    { id: 'b', name: 'Price check', text: 'Would you take {price}?' },
    { id: 'c', name: 'Inv me', text: 'Sure, inv me.' },
  ];
  const listed = () =>
    within(screen.getByRole('list', { name: '我的模板' }))
      .queryAllByRole('listitem')
      .map((li) => li.querySelector('.font-medium')?.textContent);
  const savedTemplates = () => lastSaved()?.chatTemplates;
  const nameInput = () => screen.getByLabelText('名称') as HTMLInputElement;
  const textInput = () => screen.getByLabelText('消息') as HTMLTextAreaElement;

  it('explains how templates are used and lists the custom ones before the offer templates', () => {
    renderForm({ chatTemplates: MINE });
    expect(
      screen.queryByText(
        /令牌会从当前会话自动填入；其他.*占位符会在使用时询问/,
      ),
    ).not.toBeNull();
    expect(listed()).toEqual(['Still available?', 'Price check', 'Inv me']);
    expect(screen.getByLabelText('接受报价消息模板')).toBeTruthy();
  });

  it('adds a template, saved at the end of the list right away', async () => {
    renderForm({ chatTemplates: MINE });
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    fireEvent.change(nameInput(), { target: { value: '  Haggle ' } });
    fireEvent.change(textInput(), { target: { value: 'Would you take {price}, {accountName}?\nty' } });
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));

    expect(store.updateSettings).toHaveBeenCalledTimes(1);
    expect(savedTemplates()).toEqual([
      ...MINE,
      { id: expect.any(String), name: 'Haggle', text: 'Would you take {price}, {accountName}?\nty' },
    ]);
    expect(new Set(savedTemplates()!.map((t) => t.id)).size).toBe(4);
    expect(listed()).toEqual(['Still available?', 'Price check', 'Inv me', 'Haggle']);
    // The add form closed
    expect(screen.queryByLabelText('名称')).toBeNull();
  });

  it('requires a name and a message, within the length limits', () => {
    renderForm({ chatTemplates: [] });
    expect(screen.queryByText('暂无自定义模板。')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    fireEvent.change(nameInput(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      '请填写模板名称',
      '请填写消息内容',
    ]);
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(nameInput(), { target: { value: 'x'.repeat(41) } });
    fireEvent.change(textInput(), { target: { value: 'y'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      '名称最多可输入 40 个字符',
      '消息最多可输入 500 个字符',
    ]);
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it('edits a template in place, keeping its id and position; Cancel keeps it as it was', () => {
    renderForm({ chatTemplates: MINE });
    fireEvent.click(screen.getByRole('button', { name: '编辑模板：Price check' }));
    expect(nameInput().value).toBe('Price check');
    expect(textInput().value).toBe('Would you take {price}?');
    fireEvent.change(nameInput(), { target: { value: 'Offer' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(store.updateSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '编辑模板：Price check' }));
    fireEvent.change(nameInput(), { target: { value: 'Offer' } });
    fireEvent.change(textInput(), { target: { value: 'I can do {price} for the {itemName}' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(savedTemplates()).toEqual([
      MINE[0],
      { id: 'b', name: 'Offer', text: 'I can do {price} for the {itemName}' },
      MINE[2],
    ]);
    expect(listed()).toEqual(['Still available?', 'Offer', 'Inv me']);
  });

  it('deletes a template', () => {
    renderForm({ chatTemplates: MINE });
    fireEvent.click(screen.getByRole('button', { name: '删除模板：Price check' }));
    expect(savedTemplates()).toEqual([MINE[0], MINE[2]]);
  });

  it('reorders templates with the up/down buttons', () => {
    renderForm({ chatTemplates: MINE });
    expect((screen.getByRole('button', { name: '上移模板：Still available?' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下移模板：Inv me' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '上移模板：Inv me' }));
    expect(savedTemplates()?.map((t) => t.id)).toEqual(['a', 'c', 'b']);
    fireEvent.click(screen.getByRole('button', { name: '下移模板：Still available?' }));
    expect(savedTemplates()?.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(listed()).toEqual(['Inv me', 'Still available?', 'Price check']);
  });

  it('inserts a token chip at the caret, replacing a selection', () => {
    renderForm({ chatTemplates: [] });
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    const chip = (token: string) =>
      within(screen.getByRole('form', { name: '新建模板' })).getByRole('button', { name: token });
    fireEvent.change(textInput(), { target: { value: 'Hi  there' } });
    textInput().setSelectionRange(3, 3);
    fireEvent.click(chip('{accountName}'));
    expect(textInput().value).toBe('Hi {accountName} there');
    expect(textInput().selectionStart).toBe(16);

    textInput().setSelectionRange(17, 22);
    fireEvent.click(chip('{itemName}'));
    expect(textInput().value).toBe('Hi {accountName} {itemName}');
  });

  it('shows which placeholders a template will ask for when used, for custom and offer templates', () => {
    renderForm({ chatTemplates: [], rejectOfferMessageTemplate: 'No, {reason}' });
    expect(screen.getByText(/在聊天中使用时需要填写：/).textContent).toBe('在聊天中使用时需要填写：{reason}');

    fireEvent.click(screen.getByRole('button', { name: '添加模板' }));
    fireEvent.change(textInput(), { target: { value: 'join {game} / {pw} as {accountName}' } });
    expect(screen.getByText(/使用时询问：/).textContent?.replace(/\s+/g, ' ').trim()).toBe('使用时询问： {game} {pw}');
  });

  it('stars and unstars a template (its chip above the chat message box)', () => {
    renderForm({ chatTemplates: [MINE[0], { ...MINE[1], favorite: true }] });
    const star = screen.getByRole('button', { name: '收藏：Still available?' });
    expect(star.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(star);
    expect(savedTemplates()?.[0]).toEqual({ ...MINE[0], favorite: true });
    expect(screen.getByRole('button', { name: '取消收藏：Still available?' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '取消收藏：Price check' }));
    expect(savedTemplates()?.[1]).toEqual({ ...MINE[1], favorite: false });
  });
});
