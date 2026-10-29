use super::{Foreground, WindowRect};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Arc, Mutex};
use std::{ffi::OsStr, iter, os::windows::prelude::OsStrExt, ptr};
use tauri::AppHandle;

use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO,
        MONITOR_DEFAULTTONEAREST, MONITOR_DEFAULTTOPRIMARY,
    },
    UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
    UI::WindowsAndMessaging::{
        FindWindowW, GetForegroundWindow, GetWindowRect,
        GetWindowThreadProcessId, GetWindowLongW, IsIconic, SetForegroundWindow, SetWindowPos, ShowWindow,
        GWL_EXSTYLE, WS_EX_TOPMOST,
        EVENT_SYSTEM_FOREGROUND, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SW_RESTORE, WINEVENT_OUTOFCONTEXT,
    },
};

fn to_wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(iter::once(0)).collect()
}

fn find_diablo_hwnd() -> Option<HWND> {
    let title_w = to_wide("Diablo II");
    let hwnd: HWND = unsafe { FindWindowW(ptr::null(), title_w.as_ptr()) };
    (hwnd != 0).then_some(hwnd)
}

pub fn get_diablo_rect(_app: &AppHandle) -> Option<WindowRect> {
    let hwnd = find_diablo_hwnd()?;
    let mut r = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let ok = unsafe { GetWindowRect(hwnd, &mut r as *mut RECT) };
    if ok == 0 {
        return None;
    }
    Some(WindowRect {
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
    })
}

/// The overlay window (Main), the only one of ours that counts as `Foreground::OwnWindow`.
static OVERLAY_WINDOW: AtomicIsize = AtomicIsize::new(0);
static OVERLAY_PINNED: AtomicBool = AtomicBool::new(false);

pub fn set_overlay_pinned(pinned: bool) {
    OVERLAY_PINNED.store(pinned, Ordering::SeqCst);
}

pub fn set_overlay_window(hwnd: HWND) {
    OVERLAY_WINDOW.store(hwnd, Ordering::SeqCst);
}

/// Float only in the game context. A stale frontend request must not cover a newly focused app.
pub fn set_overlay_z_order(hwnd: HWND, topmost: bool) -> Result<(), String> {
    let insert_after = overlay_z_order_target_with_pin(foreground(), super::is_game_context(), topmost, OVERLAY_PINNED.load(Ordering::SeqCst));
    let ok = unsafe {
        SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    };
    if ok == 0 {
        return Err("SetWindowPos failed while changing overlay z-order".to_string());
    }
    // A pinned market stays on the desktop, immediately behind a normal foreground app.
    // If that app is itself topmost (e.g. a capture overlay), demotion already leaves it above us.
    if insert_after == HWND_NOTOPMOST && OVERLAY_PINNED.load(Ordering::SeqCst) && foreground() == Foreground::Other {
        let active = unsafe { GetForegroundWindow() };
        if active != 0 && unsafe { GetWindowLongW(active, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST == 0 } {
            let placed = unsafe { SetWindowPos(hwnd, active, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) };
            if placed == 0 { return Err("SetWindowPos failed while yielding to foreground application".to_string()); }
        }
    }
    Ok(())
}

fn overlay_z_order_target_with_pin(owner: Foreground, in_game: bool, topmost: bool, pinned: bool) -> HWND {
    if pinned && owner == Foreground::Other { return HWND_NOTOPMOST; }
    overlay_z_order_target(owner, in_game, topmost)
}

fn overlay_z_order_target(owner: Foreground, in_game: bool, topmost: bool) -> HWND {
    let can_float = matches!(owner, Foreground::Diablo | Foreground::OwnWindow) && in_game;
    if topmost && can_float {
        HWND_TOPMOST
    } else if owner == Foreground::OwnWindow {
        // Desktop Settings has explicitly taken focus. Remove topmost status without
        // burying the active window below the game or browser that launched the tray action.
        HWND_NOTOPMOST
    } else {
        HWND_BOTTOM
    }
}

pub fn foreground() -> Foreground {
    let mut window = unsafe { GetForegroundWindow() };
    if window == 0 {
        // Mid-activation Windows reports no foreground window; the hook already named the one activating.
        window = LAST_FOREGROUND_EVENT.load(Ordering::SeqCst);
    }
    let mut pid: u32 = 0;
    if window != 0 {
        unsafe { GetWindowThreadProcessId(window, &mut pid) };
    }
    classify(
        window,
        OVERLAY_WINDOW.load(Ordering::SeqCst),
        find_diablo_hwnd(),
        pid == std::process::id(),
    )
}

/// Foreground owner of `window`. Our windows other than the overlay carry no information, like no window at all:
/// the tray menu's owner window takes the foreground while the menu is open, which isn't the overlay.
fn classify(window: HWND, overlay: HWND, diablo: Option<HWND>, ours: bool) -> Foreground {
    if window == 0 {
        Foreground::Unknown
    } else if diablo == Some(window) {
        Foreground::Diablo
    } else if window == overlay {
        Foreground::OwnWindow
    } else if ours {
        Foreground::Unknown
    } else {
        Foreground::Other
    }
}

pub fn diablo_running() -> bool {
    find_diablo_hwnd().is_some()
}

/// Gives keyboard focus back to the Diablo II window.
pub fn focus_diablo() -> bool {
    crate::debug_logger::overlay_trace("native focus-diablo start");
    let Some(hwnd) = find_diablo_hwnd() else {
        crate::debug_logger::overlay_trace("native focus-diablo found=false");
        return false;
    };
    let owner = foreground();
    if !may_return_focus_to_game(owner) {
        crate::debug_logger::overlay_trace(&format!("native focus-diablo skipped owner={:?}", owner));
        return false;
    }
    unsafe {
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
    }
    crate::debug_logger::overlay_trace("native focus-diablo foreground-start");
    let focused = bring_to_foreground(hwnd);
    crate::debug_logger::overlay_trace(&format!("native focus-diablo success={}", focused));
    focused
}

fn may_return_focus_to_game(owner: Foreground) -> bool {
    matches!(owner, Foreground::Diablo | Foreground::OwnWindow)
}

/// Requests foreground activation without joining the game's input queue to the overlay UI thread.
/// Windows can refuse the request; callers must handle a false result rather than blocking on
/// another process's message loop.
pub fn bring_to_foreground(hwnd: HWND) -> bool {
    unsafe {
        if GetForegroundWindow() == hwnd {
            return true;
        }
        SetForegroundWindow(hwnd);
        GetForegroundWindow() == hwnd
    }
}

fn work_area(monitor: HMONITOR) -> Option<WindowRect> {
    if monitor == 0 {
        return None;
    }
    let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
        return None;
    }
    let r = info.rcWork;
    Some(WindowRect {
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
    })
}

/// Work area (monitor minus taskbar) of the monitor containing Diablo II, else the primary monitor. Not the full
/// monitor rect: an always-on-top window covering the taskbar makes Windows draw it greyed out, as if behind a
/// fullscreen app.
pub fn get_appropriate_window_bounds(_app: &AppHandle) -> Option<WindowRect> {
    let monitor = match find_diablo_hwnd() {
        Some(hwnd) => unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) },
        None => unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) },
    };
    work_area(monitor)
}

// --- Event-driven foreground monitoring ---

static mut FOREGROUND_HOOK: Option<HWINEVENTHOOK> = None;

static CALLBACK: Mutex<Option<Arc<dyn Fn() + Send + Sync>>> = Mutex::new(None);

/// Window named by the last EVENT_SYSTEM_FOREGROUND.
static LAST_FOREGROUND_EVENT: AtomicIsize = AtomicIsize::new(0);

unsafe extern "system" fn win_event_proc(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    LAST_FOREGROUND_EVENT.store(hwnd, Ordering::SeqCst);
    // Yield natively before React processes the event; no debounce or webview responsiveness needed.
    let overlay = OVERLAY_WINDOW.load(Ordering::SeqCst);
    if overlay != 0 && foreground() == Foreground::Other {
        let _ = set_overlay_z_order(overlay, false);
    }
    let callback = CALLBACK.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if let Some(cb) = callback {
        cb();
    }
}

pub fn initialize_foreground_monitoring<F: Fn() + Send + Sync + 'static>(callback: F) {
    unsafe {
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            0,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        FOREGROUND_HOOK = Some(hook);
        *CALLBACK.lock().unwrap() = Some(Arc::new(callback));
    }
}

pub fn cleanup_foreground_monitoring() {
    unsafe {
        if let Some(hook) = FOREGROUND_HOOK {
            UnhookWinEvent(hook);
            FOREGROUND_HOOK = None;
        }
        *CALLBACK.lock().unwrap() = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OVERLAY: HWND = 10;
    const DIABLO: HWND = 20;
    const TRAY_MENU_OWNER: HWND = 30;
    const BROWSER: HWND = 40;

    #[test]
    fn returning_focus_never_pulls_the_game_over_another_application() {
        assert!(may_return_focus_to_game(Foreground::Diablo));
        assert!(may_return_focus_to_game(Foreground::OwnWindow));
        assert!(!may_return_focus_to_game(Foreground::Other));
        assert!(!may_return_focus_to_game(Foreground::Unknown));
    }

    #[test]
    fn pinned_market_yields_topmost_when_other_app_is_foreground() {
        assert_eq!(overlay_z_order_target_with_pin(Foreground::Other, false, false, true), HWND_NOTOPMOST);
        assert_eq!(overlay_z_order_target_with_pin(Foreground::Other, false, false, false), HWND_BOTTOM);
        assert_eq!(overlay_z_order_target_with_pin(Foreground::Diablo, true, true, true), HWND_TOPMOST);
        assert_eq!(overlay_z_order_target_with_pin(Foreground::OwnWindow, false, true, true), HWND_NOTOPMOST);
    }

    #[test]
    fn desktop_settings_loses_topmost_status_without_being_buried() {
        assert_eq!(
            overlay_z_order_target(Foreground::OwnWindow, false, false),
            HWND_NOTOPMOST
        );
        assert_eq!(
            overlay_z_order_target(Foreground::OwnWindow, false, true),
            HWND_NOTOPMOST
        );
    }

    #[test]
    fn another_application_always_wins_over_a_stale_float_request() {
        assert_eq!(
            overlay_z_order_target(Foreground::Other, true, true),
            HWND_BOTTOM
        );
        assert_eq!(
            overlay_z_order_target(Foreground::Diablo, true, true),
            HWND_TOPMOST
        );
    }

    #[test]
    fn only_the_overlay_counts_as_our_window() {
        assert_eq!(
            classify(OVERLAY, OVERLAY, Some(DIABLO), true),
            Foreground::OwnWindow
        );
        // The tray menu briefly takes the foreground: not the overlay, so no information
        assert_eq!(
            classify(TRAY_MENU_OWNER, OVERLAY, Some(DIABLO), true),
            Foreground::Unknown
        );
    }

    #[test]
    fn classifies_the_game_other_apps_and_no_window() {
        assert_eq!(
            classify(DIABLO, OVERLAY, Some(DIABLO), false),
            Foreground::Diablo
        );
        assert_eq!(
            classify(BROWSER, OVERLAY, Some(DIABLO), false),
            Foreground::Other
        );
        assert_eq!(classify(BROWSER, OVERLAY, None, false), Foreground::Other);
        assert_eq!(
            classify(0, OVERLAY, Some(DIABLO), false),
            Foreground::Unknown
        );
    }

    #[test]
    fn the_overlay_is_ours_even_without_the_game() {
        assert_eq!(
            classify(OVERLAY, OVERLAY, None, true),
            Foreground::OwnWindow
        );
    }
}
