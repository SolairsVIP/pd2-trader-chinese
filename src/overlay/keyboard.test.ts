import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  claimKeyboard,
  FOREGROUND_EVENT,
  isKeyboardClaimed,
  releaseKeyboard,
  resetKeyboardStateForTests,
  trackKeyboardFocus,
  type ForegroundOwner,
} from './keyboard';

const win = vi.hoisted(() => ({
  setFocusable: vi.fn(async (_focusable: boolean) => {}),
  setFocus: vi.fn(async () => {}),
}));
/** The Rust foreground hook's listener (FOREGROUND_EVENT), registered by trackKeyboardFocus. */
const events = vi.hoisted(() => ({
  foreground: null as ((e: { payload: string }) => void) | null,
  subscribed: [] as string[],
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(), invoke: vi.fn(async () => true) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }));
vi.mock('@/lib/browser-events', () => ({
  listen: vi.fn(async (event: string, handler: (e: { payload: string }) => void) => {
    events.subscribed.push(event);
    events.foreground = handler;
    return () => {
      events.foreground = null;
    };
  }),
}));

/** Drain the microtasks of the listen().then(...) subscription chain. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
/** The OS foreground moved to `owner`. */
const foreground = (owner: ForegroundOwner) => events.foreground!({ payload: owner });
/** Rust command answers; anything not listed resolves true (in the game, overlay came to the front, ...). */
let commands: Record<string, unknown>;
const calls = (command: string) => vi.mocked(invoke).mock.calls.filter(([name]) => name === command).length;
const callOrder = (command: string) =>
  vi.mocked(invoke).mock.invocationCallOrder[vi.mocked(invoke).mock.calls.findIndex(([name]) => name === command)];

beforeEach(() => {
  vi.clearAllMocks();
  resetKeyboardStateForTests();
  win.setFocusable.mockImplementation(async () => {});
  events.foreground = null;
  events.subscribed = [];
  commands = {};
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementation(async (command: string) => (command in commands ? commands[command] : true));
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('claimKeyboard', () => {
  it('makes Main focusable, then brings it to the front through focus_overlay', async () => {
    await claimKeyboard();
    expect(win.setFocusable).toHaveBeenCalledWith(true);
    expect(invoke).toHaveBeenCalledWith('focus_overlay');
    expect(win.setFocus).not.toHaveBeenCalled(); // refused by Windows while the game holds the foreground right
    expect(win.setFocusable.mock.invocationCallOrder[0]).toBeLessThan(callOrder('focus_overlay'));
    expect(isKeyboardClaimed()).toBe(true);
  });

  it('is idempotent while claimed', async () => {
    await claimKeyboard();
    await claimKeyboard();
    expect(calls('focus_overlay')).toBe(1);
  });

  it('backs out when the overlay could not come to the front, so it is not stuck claimed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    commands.focus_overlay = false;
    await claimKeyboard();
    expect(isKeyboardClaimed()).toBe(false);
    expect(win.setFocusable).toHaveBeenLastCalledWith(false);

    commands.focus_overlay = true;
    await claimKeyboard(); // the next claim (e.g. a click on the panel) tries again
    expect(isKeyboardClaimed()).toBe(true);
  });

  it('stays unclaimed when the window call fails, so the next pointerdown retries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValueOnce(new Error('nope'));
    await claimKeyboard();
    expect(isKeyboardClaimed()).toBe(false);
    await claimKeyboard();
    expect(isKeyboardClaimed()).toBe(true);
  });

  it('restores the non-focusable window if native activation throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'focus_overlay') throw new Error('activation failed');
      return true;
    });
    await claimKeyboard();
    expect(isKeyboardClaimed()).toBe(false);
    expect(win.setFocusable).toHaveBeenLastCalledWith(false);
  });

  it('is a no-op in a browser', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    await claimKeyboard();
    expect(win.setFocusable).not.toHaveBeenCalled();
    expect(isKeyboardClaimed()).toBe(false);
  });
});

describe('releaseKeyboard', () => {
  it('retries a temporarily refused focus return so the user does not need to click the game', async () => {
    vi.useFakeTimers();
    try {
      let owner = 'diablo';
      let attempts = 0;
      vi.mocked(invoke).mockImplementation(async (command: string) => {
        if (command === 'focus_overlay') { owner = 'overlay'; return true; }
        if (command === 'focus_diablo') {
          if (++attempts === 1) return false;
          owner = 'diablo';
        }
        return true;
      });
      await claimKeyboard();
      const closing = releaseKeyboard({ focusGame: true });
      await flush();
      await vi.advanceTimersByTimeAsync(150);
      await closing;
      expect(owner).toBe('diablo');
      expect(attempts).toBe(2);
      expect(win.setFocusable).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the game when the menu closes while activation is still in flight', async () => {
    let unblock!: () => void;
    const activation = new Promise<void>((resolve) => { unblock = resolve; });
    let focusable = false;
    let owner = 'diablo';
    win.setFocusable.mockImplementation(async (next) => {
      if (next) await activation;
      focusable = next;
    });
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'focus_overlay') { if (focusable) owner = 'overlay'; return focusable; }
      if (command === 'focus_diablo') { owner = 'diablo'; return true; }
      return true;
    });

    const opening = claimKeyboard();
    await flush();
    const closing = releaseKeyboard({ focusGame: true });
    await flush();
    unblock();
    await Promise.all([opening, closing]);

    expect(owner).toBe('diablo');
    expect(focusable).toBe(false);
    expect(isKeyboardClaimed()).toBe(false);
  });

  it('keeps the reopened menu focused when an older close finishes late', async () => {
    let unblock!: () => void;
    const release = new Promise<void>((resolve) => { unblock = resolve; });
    let focusable = false;
    let owner = 'diablo';
    win.setFocusable.mockImplementation(async (next) => {
      if (!next) await release;
      focusable = next;
    });
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'focus_overlay') { if (focusable) owner = 'overlay'; return focusable; }
      if (command === 'focus_diablo') { owner = 'diablo'; return true; }
      return true;
    });

    await claimKeyboard();
    const closing = releaseKeyboard({ focusGame: true });
    await flush();
    const reopening = claimKeyboard();
    await flush();
    unblock();
    await Promise.all([closing, reopening]);

    expect(owner).toBe('overlay');
    expect(focusable).toBe(true);
    expect(isKeyboardClaimed()).toBe(true);
  });

  it('makes Main non-focusable and hands focus back to Diablo', async () => {
    await claimKeyboard();
    await releaseKeyboard();
    expect(win.setFocusable).toHaveBeenLastCalledWith(false);
    expect(invoke).toHaveBeenCalledWith('focus_diablo');
    expect(isKeyboardClaimed()).toBe(false);
  });

  it('can skip focusing the game', async () => {
    await claimKeyboard();
    await releaseKeyboard({ focusGame: false });
    expect(invoke).not.toHaveBeenCalledWith('focus_diablo');
  });

  it('leaves the game in the background when the keyboard was claimed outside it (Settings from the tray)', async () => {
    commands.is_diablo_focused = false;
    await claimKeyboard();
    await releaseKeyboard();
    expect(win.setFocusable).toHaveBeenLastCalledWith(false);
    expect(invoke).not.toHaveBeenCalledWith('focus_diablo');
    expect(isKeyboardClaimed()).toBe(false);
  });

  it('still hands focus to the game on request (a hotkey copying the item under the cursor)', async () => {
    commands.is_diablo_focused = false;
    await claimKeyboard();
    await releaseKeyboard({ focusGame: true });
    expect(invoke).toHaveBeenCalledWith('focus_diablo');
  });

  it('does nothing when the keyboard was not claimed', async () => {
    await releaseKeyboard();
    expect(win.setFocusable).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('trackKeyboardFocus', () => {
  async function track() {
    const seen: [boolean, boolean][] = [];
    const stop = trackKeyboardFocus((focused, handoff) => seen.push([focused, handoff]));
    await flush();
    return { seen, stop };
  }

  it('hands control back to the game after each of two complete menu sessions', async () => {
    const { seen, stop } = await track();
    foreground('diablo');
    for (let i = 0; i < 2; i++) {
      await claimKeyboard();
      foreground('ownWindow');
      await releaseKeyboard({ focusGame: true });
      foreground('diablo');
      expect(isKeyboardClaimed()).toBe(false);
    }
    expect(calls('focus_diablo')).toBe(2);
    expect(seen).toEqual([[true, false], [false, true], [true, false], [false, true]]);
    stop();
  });

  it('does not cancel a reopened menu when the previous handoff event arrives late', async () => {
    const { seen, stop } = await track();
    let finishHandoff!: () => void;
    const handoff = new Promise<void>((resolve) => { finishHandoff = resolve; });
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === 'focus_diablo') await handoff;
      return true;
    });
    foreground('diablo');
    await claimKeyboard();
    foreground('ownWindow');

    const closing = releaseKeyboard({ focusGame: true });
    await flush();
    const reopening = claimKeyboard();
    await flush();
    foreground('diablo'); // delayed notification from the previous close
    finishHandoff();
    await Promise.all([closing, reopening]);

    expect(isKeyboardClaimed()).toBe(true);
    expect(win.setFocusable).toHaveBeenLastCalledWith(true);
    expect(seen).not.toContainEqual([false, false]);
    stop();
  });

  it('does not treat a late overlay heartbeat as a completed reopening', async () => {
    const { stop } = await track();
    let finishRelease!: () => void;
    const release = new Promise<void>((resolve) => { finishRelease = resolve; });
    win.setFocusable.mockImplementation(async (next) => { if (!next) await release; });
    foreground('diablo');
    await claimKeyboard();
    foreground('ownWindow');

    const closing = releaseKeyboard({ focusGame: true });
    await flush();
    foreground('ownWindow'); // heartbeat for the old, still-closing session
    const reopening = claimKeyboard();
    finishRelease();
    await Promise.all([closing, reopening]);

    expect(isKeyboardClaimed()).toBe(true);
    expect(win.setFocusable).toHaveBeenLastCalledWith(true);
    expect(calls('focus_overlay')).toBe(2);
    stop();
  });

  it('does not steal focus from another app when activation finishes after the user switched away', async () => {
    const { stop } = await track();
    let finishActivation!: () => void;
    const activation = new Promise<void>((resolve) => { finishActivation = resolve; });
    win.setFocusable.mockImplementation(async (next) => { if (next) await activation; });
    foreground('diablo');
    const opening = claimKeyboard();
    await flush();
    foreground('other');
    finishActivation();
    await opening;
    await flush();

    expect(isKeyboardClaimed()).toBe(false);
    expect(win.setFocusable).toHaveBeenLastCalledWith(false);
    expect(calls('focus_overlay')).toBe(0);
    stop();
  });

  it('does not pull the game forward after the user switches away during a close', async () => {
    const { seen, stop } = await track();
    let finishRelease!: () => void;
    const release = new Promise<void>((resolve) => { finishRelease = resolve; });
    win.setFocusable.mockImplementation(async (next) => { if (!next) await release; });
    foreground('diablo');
    await claimKeyboard();
    foreground('ownWindow');

    const closing = releaseKeyboard({ focusGame: true });
    await flush();
    foreground('other');
    finishRelease();
    await closing;
    await flush();

    expect(calls('focus_diablo')).toBe(0);
    expect(isKeyboardClaimed()).toBe(false);
    expect(seen.at(-1)).toEqual([false, false]);
    stop();
  });

  it('cancels a focus retry when the user has switched to another application', async () => {
    vi.useFakeTimers();
    try {
      const { stop } = await track();
      vi.mocked(invoke).mockImplementation(async (command: string) => command !== 'focus_diablo');
      foreground('diablo');
      await claimKeyboard();
      foreground('ownWindow');
      const closing = releaseKeyboard({ focusGame: true });
      await flush();
      foreground('other');
      await vi.advanceTimersByTimeAsync(150);
      await closing;
      expect(calls('focus_diablo')).toBe(1);
      expect(isKeyboardClaimed()).toBe(false);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows the Rust foreground hook', async () => {
    const { stop } = await track();
    expect(events.subscribed).toEqual([FOREGROUND_EVENT]);
    stop();
    expect(events.foreground).toBeNull();
  });

  it('treats the overlay coming to the front as focused and claimed', async () => {
    const { seen, stop } = await track();
    foreground('diablo');
    foreground('ownWindow');
    expect(seen).toEqual([[true, false]]);
    expect(isKeyboardClaimed()).toBe(true);
    stop();
  });

  it('reports the user clicking from the overlay back into the game, and ends the claim', async () => {
    const { seen, stop } = await track();
    foreground('diablo');
    await claimKeyboard();
    foreground('ownWindow');
    win.setFocusable.mockClear();

    foreground('diablo');
    expect(seen).toEqual([
      [true, false],
      [false, false],
    ]);
    expect(isKeyboardClaimed()).toBe(false);
    await flush();
    expect(win.setFocusable).toHaveBeenCalledWith(false);
    // The user went there themselves: no focus_diablo round-trip
    expect(invoke).not.toHaveBeenCalledWith('focus_diablo');
    stop();
  });

  it('reports switching from the overlay to another app', async () => {
    const { seen, stop } = await track();
    foreground('ownWindow');
    foreground('other');
    expect(seen).toEqual([
      [true, false],
      [false, false],
    ]);
    stop();
  });

  it('reports leaving the game for another app even though the overlay never had focus', async () => {
    const { seen, stop } = await track();
    foreground('diablo');
    foreground('other');
    expect(seen).toEqual([[false, false]]);
    stop();
  });

  it('ignores switches that are not leaving: into the game, repeats and unknown foregrounds', async () => {
    // Start outside the game. The seeded game context otherwise makes the first 'other' a real departure.
    commands.is_diablo_focused = false;
    const { seen, stop } = await track();
    foreground('other');
    foreground('diablo');
    foreground('diablo');
    foreground('unknown');
    foreground('other'); // from diablo: leaving, the unknown in between didn't reset it
    expect(seen).toEqual([[false, false]]);
    stop();
  });

  it('marks the loss caused by releaseKeyboard as a hand-off, and only that one', async () => {
    const { seen, stop } = await track();
    await claimKeyboard();
    foreground('ownWindow');
    await releaseKeyboard();
    foreground('diablo'); // our hand-off to the game
    await claimKeyboard();
    foreground('ownWindow');
    foreground('diablo'); // the user clicking into the game
    expect(seen).toEqual([
      [true, false],
      [false, true],
      [true, false],
      [false, false],
    ]);
    stop();
  });

  it('treats a loss long after a hand-off as the user leaving', async () => {
    vi.useFakeTimers();
    try {
      const { seen, stop } = await track();
      await claimKeyboard();
      foreground('ownWindow');
      await releaseKeyboard();
      vi.advanceTimersByTime(5000);
      foreground('diablo');
      expect(seen.at(-1)).toEqual([false, false]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not excuse the user leaving after a hand-off that changed nothing', async () => {
    // Chat closes (hand-off to the game, already in front: no foreground event), then Settings opens
    const { seen, stop } = await track();
    foreground('diablo');
    await claimKeyboard();
    await releaseKeyboard();
    await claimKeyboard();
    foreground('ownWindow');
    foreground('diablo'); // the user clicks into the game well within the hand-off window
    expect(seen).toEqual([
      [true, false],
      [false, false],
    ]);
    stop();
  });

  it('remembers that focus_overlay brought the overlay to the front even if the hook missed it', async () => {
    const { seen, stop } = await track();
    foreground('diablo');
    await claimKeyboard(); // focus_overlay -> true, but no 'ownWindow' report arrives
    foreground('diablo'); // the user clicks back into the game
    expect(seen).toEqual([[false, false]]);
    stop();
  });

  it('unsubscribes even if stopped before the listener resolved', async () => {
    const stop = trackKeyboardFocus();
    stop();
    await flush();
    expect(events.foreground).toBeNull();
  });

  it('does nothing in a browser', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    trackKeyboardFocus()();
    expect(events.subscribed).toEqual([]);
  });
});
