//! Game focus context, shared by every platform.
//!
//! Overlay panels and global hotkeys follow the *game context* rather than raw OS focus:
//! - Diablo II in the foreground starts the game context.
//! - Focus moving from Diablo onto our overlay keeps it, so typing into a panel doesn't hide the rest.
//! - Any other application in the foreground ends it. Our overlay focused from outside the game
//!   (sign-in or What's New at startup, Settings opened from the tray) is therefore not game context.
//! - No foreground window at all (Windows reports this mid-activation) is ignored instead of being read
//!   as a focus loss, which used to bounce every listener false -> true.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use super::{diablo_running, foreground, initialize_foreground_monitoring};

/// Webview event carrying the game context (`bool`); `is_diablo_focused` returns the same value.
pub const FOCUS_EVENT: &str = "diablo-focus-changed";
/// Webview event carrying the raw `Foreground` on every foreground change (Unknown skipped). Panels that close
/// when the user leaves them use it: it also sees leaving the game while the overlay never had focus.
pub const FOREGROUND_EVENT: &str = "foreground-changed";

/// Who owns the OS foreground.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Foreground {
    /// The Diablo II window.
    Diablo,
    /// One of our own windows (the overlay), whether or not Diablo II is running.
    OwnWindow,
    /// Another application.
    Other,
    /// No foreground window; carries no information.
    Unknown,
}

/// The owner as the game context sees it: our window only keeps the game context while Diablo II is
/// running; without the game it is just another app.
pub fn game_owner(owner: Foreground, diablo_running: bool) -> Foreground {
    match owner {
        Foreground::OwnWindow if !diablo_running => Foreground::Other,
        owner => owner,
    }
}

/// Game context after `foreground` takes the OS foreground while the context is `current`.
pub fn next_game_context(current: bool, foreground: Foreground) -> bool {
    match foreground {
        Foreground::Diablo => true,
        Foreground::Other => false,
        Foreground::OwnWindow | Foreground::Unknown => current,
    }
}

static GAME_CONTEXT: AtomicBool = AtomicBool::new(false);
/// Serializes read-update-emit so concurrent foreground callbacks can't emit out of order.
static TRANSITION: Mutex<()> = Mutex::new(());
static LAST_OWNER: Mutex<Foreground> = Mutex::new(Foreground::Unknown);
type FocusRefresh = dyn Fn(bool) + Send + Sync;
static REFRESH: OnceLock<Arc<FocusRefresh>> = OnceLock::new();

struct FocusActions {
    refit: bool,
    notify: bool,
}

fn focus_actions(context_changed: bool, owner_changed: bool, heartbeat: bool) -> FocusActions {
    FocusActions {
        refit: context_changed || owner_changed,
        notify: context_changed || heartbeat,
    }
}

/// Reconcile live OS state before a hotkey/focus query, even if a WinEvent was missed.
pub fn refresh_game_context() -> bool {
    if let Some(refresh) = REFRESH.get() {
        refresh(false);
    }
    is_game_context()
}

/// True while the user is in the game: Diablo II is in front, or one of our windows was focused from it.
pub fn is_game_context() -> bool {
    GAME_CONTEXT.load(Ordering::SeqCst)
}

/// Seeds the game context from the current foreground, emits it, then re-evaluates on every
/// foreground change; `on_change` runs after each emitted value (initial one included).
pub fn initialize_diablo_focus_monitoring(
    app_handle: AppHandle,
    on_change: Box<dyn Fn(bool) + Send + Sync + 'static>,
) {
    let poll_app = app_handle.clone();
    let last_emit = Mutex::new(std::time::Instant::now());
    let update: Arc<FocusRefresh> = Arc::new(move |force_emit: bool| {
        // Hiding/moving a native window can re-enter the WinEvent hook. Never block it on ourselves.
        let Ok(transition) = TRANSITION.try_lock() else {
            return;
        };
        let owner = foreground();
        let mut last_owner = LAST_OWNER.lock().unwrap_or_else(|p| p.into_inner());
        let owner_changed = owner != Foreground::Unknown && owner != *last_owner;
        if owner != Foreground::Unknown {
            *last_owner = owner;
        }
        let current = GAME_CONTEXT.load(Ordering::SeqCst);
        let next = next_game_context(current, game_owner(owner, diablo_running()));
        GAME_CONTEXT.store(next, Ordering::SeqCst);
        let context_changed = next != current || force_emit;
        let mut emitted_at = last_emit.lock().unwrap_or_else(|p| p.into_inner());
        let heartbeat = next && emitted_at.elapsed() >= std::time::Duration::from_secs(2);
        let actions = focus_actions(context_changed, owner_changed, heartbeat);
        let notify = actions.notify;
        if notify {
            *emitted_at = std::time::Instant::now();
        }
        drop(emitted_at);
        drop(last_owner);
        drop(transition);
        if context_changed || owner_changed {
            crate::debug_logger::overlay_trace(&format!("native owner={:?} game={}", owner, next));
        }
        // Wake/re-fit the native host BEFORE asking a previously hidden renderer to render UI.
        if actions.refit {
            on_change(next);
        }
        if owner != Foreground::Unknown && (owner_changed || notify) {
            let _ = app_handle.emit(FOREGROUND_EVENT, owner);
        }
        if notify {
            let delivered = app_handle.emit(FOCUS_EVENT, next).is_ok();
            crate::debug_logger::overlay_trace(&format!(
                "native focus-send game={} pulse={} accepted={}",
                next, heartbeat, delivered
            ));
        }
    });

    if REFRESH.set(update.clone()).is_err() {
        return;
    }
    update(true);
    let event_update = update.clone();
    initialize_foreground_monitoring(move || event_update(false));
    // WinEvent remains the fast path. Reconcile on the native main loop even when the WebView is
    // hidden/occluded, so browser/video -> game never relies on a tray action to repair a missed event.
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let refresh = update.clone();
        if poll_app.run_on_main_thread(move || refresh(false)).is_err() {
            break;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::Foreground::*;
    use super::*;

    #[test]
    fn heartbeat_notifies_renderer_without_refitting_an_unchanged_window() {
        let actions = focus_actions(false, false, true);
        assert!(actions.notify);
        assert!(!actions.refit);
        assert!(focus_actions(true, false, false).refit);
        assert!(focus_actions(false, true, false).refit);
        assert!(!focus_actions(false, false, false).refit);
    }

    fn run(start: bool, steps: &[Foreground]) -> Vec<bool> {
        steps
            .iter()
            .scan(start, |ctx, fg| {
                *ctx = next_game_context(*ctx, *fg);
                Some(*ctx)
            })
            .collect()
    }

    #[test]
    fn own_window_focused_from_the_game_keeps_the_game_context() {
        assert_eq!(
            run(false, &[Diablo, OwnWindow, OwnWindow, Diablo]),
            [true, true, true, true]
        );
    }

    #[test]
    fn own_window_focused_from_outside_the_game_is_not_game_context() {
        // Startup sign-in / What's New, or Settings opened from the tray while in another app
        assert_eq!(run(false, &[OwnWindow]), [false]);
        assert_eq!(
            run(false, &[Diablo, Other, OwnWindow]),
            [true, false, false]
        );
    }

    #[test]
    fn leaving_to_another_app_ends_the_game_context() {
        assert_eq!(run(false, &[Diablo, OwnWindow, Other]), [true, true, false]);
    }

    #[test]
    fn missing_foreground_window_does_not_flip_the_context() {
        assert_eq!(run(false, &[Diablo, Unknown, Diablo]), [true, true, true]);
        assert_eq!(run(false, &[Other, Unknown]), [false, false]);
    }

    #[test]
    fn our_window_is_only_game_context_while_diablo_runs() {
        assert_eq!(game_owner(OwnWindow, true), OwnWindow);
        // Settings opened from the tray without the game: reported as ours, but not game context
        assert_eq!(game_owner(OwnWindow, false), Other);
        assert_eq!(run(true, &[game_owner(OwnWindow, false)]), [false]);
        for owner in [Diablo, Other, Unknown] {
            assert_eq!(game_owner(owner, false), owner);
            assert_eq!(game_owner(owner, true), owner);
        }
    }
}
