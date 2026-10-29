import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@/lib/browser-events';

/**
 * Keyboard focus for the single non-focusable overlay window.
 *
 * Main is created focusable(false) so clicks never steal focus (or sound) from Diablo II. The keyboard is claimed
 * only when the user clicks into a text field in a panel (setFocusable(true) + focus_overlay); the claim ends
 * when the user leaves the overlay, clicks elsewhere in a panel, or the last keyboard panel closes (then focus
 * goes back to the game).
 */
let claimed = false;
/** When releaseKeyboard() last handed focus away; the focus loss that follows is ours, not a user click. */
let handoffAt = 0;
const HANDOFF_BLUR_MS = 1000;
const FOCUS_RETURN_RETRY_MS = 100;
/** Last known foreground owner: the Rust hook's reports, plus our own successful focus_overlay. */
let foregroundOwner: ForegroundOwner | null = null;
/** The keyboard was claimed while the user was in the game, so releasing it hands focus back to the game. */
let claimedFromGame = false;
// Native window commands are asynchronous. Serialize them so an old close cannot
// finish after a new open (or an old open after a close).
let focusQueue: Promise<void> = Promise.resolve();
let focusVersion = 0;
let handoffVersion = 0;

function enqueueFocusOperation(operation: () => Promise<void>): Promise<void> {
  const next = focusQueue.then(operation);
  focusQueue = next.catch(() => {});
  return next;
}

export function isKeyboardClaimed(): boolean {
  return claimed;
}

export async function claimKeyboard(): Promise<void> {
  if (!isTauri() || (claimed && foregroundOwner === 'ownWindow')) return;
  claimed = true;
  const version = ++focusVersion;
  return enqueueFocusOperation(async () => {
    let madeFocusable = false;
    try {
      // Settings opened from the tray while in another app must not pull the game forward when it lets go
      claimedFromGame = await invoke<boolean>('is_diablo_focused');
      if (version !== focusVersion) return;
      const win = getCurrentWindow();
      await win.setFocusable(true);
      madeFocusable = true;
      if (version !== focusVersion) return;
      // Not win.setFocus(): Windows refuses it while the game holds the foreground right (after a global hotkey
      // or our injected Ctrl+C). focus_overlay works around that and reports whether Main really came to front.
      const focusedOverlay = await invoke<boolean>('focus_overlay');
      if (version !== focusVersion) return;
      if (focusedOverlay) {
        // Windows can drop the hook's report of this switch; leaving the overlay must still register
        foregroundOwner = 'ownWindow';
        // A completed activation is no longer covered by an earlier handoff.
        handoffAt = 0;
      } else {
        claimed = false;
        await win.setFocusable(false);
        console.warn('[overlay] The overlay could not take keyboard focus');
      }
    } catch (error) {
      if (version === focusVersion) {
        claimed = false;
        if (madeFocusable) {
          try {
            await getCurrentWindow().setFocusable(false);
          } catch (restoreError) {
            console.warn('[overlay] Failed to restore the non-focusable window:', restoreError);
          }
        }
      }
      console.warn('[overlay] Failed to claim keyboard focus:', error);
    }
  });
}

/**
 * Give the keyboard back: Main becomes non-focusable again and, when it was claimed in the game (or `focusGame`),
 * Diablo II is focused.
 */
export async function releaseKeyboard({ focusGame }: { focusGame?: boolean } = {}): Promise<void> {
  if (!isTauri() || !claimed) return;
  claimed = false;
  handoffAt = Date.now();
  const version = ++focusVersion;
  handoffVersion = version;
  return enqueueFocusOperation(async () => {
    if (version !== focusVersion) return;
    try {
      await getCurrentWindow().setFocusable(false);
      if (version !== focusVersion) return;
      if (focusGame ?? claimedFromGame) {
        let focused = await invoke<boolean>('focus_diablo');
        if (!focused && version === focusVersion) {
          // Windows can briefly refuse a foreground change while processing the previous one.
          await new Promise<void>((resolve) => setTimeout(resolve, FOCUS_RETURN_RETRY_MS));
          if (version !== focusVersion) return;
          focused = await invoke<boolean>('focus_diablo');
        }
        if (!focused) console.warn('[overlay] Could not return focus to the game');
      }
      if (version === focusVersion) claimed = false;
    } catch (error) {
      console.warn('[overlay] Failed to release keyboard focus:', error);
    }
  });
}

/** Who holds the OS foreground, from the Rust foreground hook (window::focus FOREGROUND_EVENT). */
export type ForegroundOwner = 'diablo' | 'ownWindow' | 'other' | 'unknown';
export const FOREGROUND_EVENT = 'foreground-changed';

/**
 * Track the user moving into and out of the overlay, from the OS foreground hook rather than the window's own
 * focus events, which can't see the user leaving the game while the overlay never had focus.
 * `onFocusChange(true)` when the overlay comes to the front; `onFocusChange(false)` when the user leaves it
 * (for the game or another app) or leaves the game for another app. Leaving ends the claim; `handoff` marks a
 * loss caused by releaseKeyboard() rather than the user. Returns the unsubscribe.
 */
export function trackKeyboardFocus(onFocusChange?: (focused: boolean, handoff: boolean) => void): () => void {
  if (!isTauri()) return () => {};
  let disposed = false;
  let receivedForegroundEvent = false;
  let unlisten: (() => void) | null = null;

  const onForeground = (owner: ForegroundOwner) => {
    if (owner === 'unknown') return;
    receivedForegroundEvent = true;
    const from = foregroundOwner;
    foregroundOwner = owner;

    if (owner === 'ownWindow') {
      // A heartbeat for the closing overlay must not revive the old session.
      if (!claimed && handoffAt && focusVersion === handoffVersion) return;
      claimed = true;
      // Keep the handoff marker until an in-flight reopening has actually acquired focus.
      if (focusVersion <= handoffVersion) handoffAt = 0;
      onFocusChange?.(true, false);
      return;
    }
    if (owner === from) return;
    const left = from === 'ownWindow' || (from === 'diablo' && owner === 'other');
    if (!left) return;

    const pendingHandoff = handoffAt !== 0;
    const handoff = owner === 'diablo' && pendingHandoff && Date.now() - handoffAt < HANDOFF_BLUR_MS;
    // A close can report its game handoff after the next open has already been requested.
    // Do not let that stale notification cancel the new controller session.
    const reopeningAfterHandoff = handoff && owner === 'diablo' && claimed && focusVersion > handoffVersion;
    handoffAt = 0;
    if ((claimed && !reopeningAfterHandoff) || (pendingHandoff && !handoff)) {
      claimed = false;
      if (!handoff) ++focusVersion;
      const version = focusVersion;
      void enqueueFocusOperation(async () => {
        if (version !== focusVersion) return;
        try {
          await getCurrentWindow().setFocusable(false);
        } catch (error) {
          console.warn('[overlay] setFocusable(false) failed:', error);
        }
      });
    }
    onFocusChange?.(false, handoff);
  };

  const initialize = async () => {
    try {
      const off = await listen<ForegroundOwner>(FOREGROUND_EVENT, ({ payload }) => onForeground(payload));
      if (disposed) {
        off();
        return;
      }
      unlisten = off;

      // The Rust foreground event can precede the React page. Seed the owner so the first later
      // transition to another app is still recognized as leaving Diablo / the overlay.
      if (foregroundOwner === null && !receivedForegroundEvent) {
        const inGameContext = await invoke<boolean>('is_diablo_focused');
        if (!disposed && !receivedForegroundEvent && foregroundOwner === null) {
          foregroundOwner = inGameContext ? 'diablo' : 'other';
        }
      }
    } catch (error) {
      console.warn('[overlay] foreground listener failed:', error);
    }
  };
  void initialize();

  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** Test seam: reset module state between tests. */
export function resetKeyboardStateForTests(): void {
  claimed = false;
  handoffAt = 0;
  foregroundOwner = null;
  claimedFromGame = false;
  focusQueue = Promise.resolve();
  focusVersion = 0;
  handoffVersion = 0;
}
