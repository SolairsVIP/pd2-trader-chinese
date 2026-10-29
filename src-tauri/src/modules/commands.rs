use crate::{chat_watcher, debug_logger, keyboard, window};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn read_game_item_clipboard() -> Option<String> {
    crate::modules::game_clipboard::read_utf8_item()
}

#[tauri::command]
pub fn get_diablo_rect(app_handle: tauri::AppHandle) -> Option<window::WindowRect> {
    window::get_diablo_rect(&app_handle)
}

#[tauri::command]
pub fn press_key(sequence: String) -> Result<(), String> {
    keyboard::press_key(sequence)
}

/// Game context, not raw focus: true while Diablo II is in front or our overlay was focused from it
/// (see `window::focus`). Same value as the `diablo-focus-changed` event.
#[tauri::command]
pub fn is_diablo_focused() -> bool {
    window::refresh_game_context()
}

/// Raw foreground owner used to keep the full-work-area overlay out of other applications' z-order.
#[tauri::command]
pub fn get_foreground_owner() -> window::Foreground {
    window::foreground()
}

/// Keep the overlay topmost while it is being used over Diablo II, then yield it without activation
/// as soon as another application becomes foreground.
#[tauri::command]
pub fn set_overlay_z_order(overlay: tauri::Window, topmost: bool, pinned: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        window::set_overlay_pinned(pinned);
        let hwnd = overlay.hwnd().map_err(|error| error.to_string())?;
        window::set_overlay_z_order(hwnd.0 as isize, topmost)
    }

    #[cfg(not(target_os = "windows"))]
    {
        overlay
            .set_always_on_top(topmost)
            .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn focus_diablo() -> bool {
    window::focus_diablo()
}

/// Watches for clicks outside the overlay's panels while a dismissable panel is open (Windows; emits
/// `overlay-outside-click`), so it can close without the overlay ever taking focus from the game.
#[tauri::command]
pub fn set_outside_click_watch(
    app_handle: tauri::AppHandle,
    overlay: tauri::Window,
    enabled: bool,
) {
    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = overlay.hwnd() {
        window::set_outside_click_watch(&app_handle, hwnd.0 as isize, enabled);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app_handle, overlay, enabled);
}

/// Brings the overlay to the foreground so a panel gets the keyboard; false when the OS refused.
/// Sync on purpose: runs on the main thread, which owns the overlay window.
#[tauri::command]
pub fn focus_overlay(overlay: tauri::Window) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = overlay.hwnd() {
            debug_logger::overlay_trace(&format!("native focus-overlay visible={}", unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::IsWindowVisible(hwnd.0 as isize) != 0
            }));
            let foreground = window::bring_to_foreground(hwnd.0 as isize);
            debug_logger::overlay_trace(&format!("native focus-overlay foreground={}", foreground));
            if foreground {
                // Child-webview hosts don't have WebviewWindow's WM_SETFOCUS forwarding.
                if let Some(webview) = overlay.app_handle().get_webview(overlay.label()) {
                    debug_logger::overlay_trace("native focus-overlay webview-start");
                    let _ = webview.set_focus();
                    debug_logger::overlay_trace("native focus-overlay webview-end");
                }
                debug_logger::overlay_trace("native focus-overlay success=true");
                return true;
            }
        }
        // Last resort, Tauri's own path (SetForegroundWindow, then a simulated Alt press)
        debug_logger::overlay_trace("native focus-overlay fallback-start");
        let _ = overlay.set_focus();
        debug_logger::overlay_trace("native focus-overlay fallback-end");
        let focused = overlay.is_focused().unwrap_or(false);
        if focused {
            if let Some(webview) = overlay.app_handle().get_webview(overlay.label()) {
                debug_logger::overlay_trace("native focus-overlay webview-start");
                let _ = webview.set_focus();
                debug_logger::overlay_trace("native focus-overlay webview-end");
            }
        }
        debug_logger::overlay_trace(&format!(
            "native focus-overlay fallback-success={}",
            focused
        ));
        focused
    }
    #[cfg(not(target_os = "windows"))]
    {
        overlay.set_focus().is_ok()
    }
}

/// Refreshes the virtual work area and fits the native host to its currently visible content.
/// Other platforms retain their original work-area window sizing.
#[tauri::command]
pub fn update_window_bounds(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return crate::region::refresh_window_bounds(&app_handle);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let Some(bounds) = window::get_appropriate_window_bounds(&app_handle) else {
            return Ok(());
        };
        let Some(main_window) =
            app_handle.get_webview_window(&crate::modules::config::WINDOW_CONFIG.labels.Main)
        else {
            return Ok(());
        };

        let position = main_window.outer_position().map_err(|e| e.to_string())?;
        if position.x != bounds.x || position.y != bounds.y {
            main_window
                .set_position(tauri::PhysicalPosition::new(bounds.x, bounds.y))
                .map_err(|e| e.to_string())?;
        }
        // Read the size only after moving: crossing onto a monitor with a different DPI makes
        // WM_DPICHANGED rescale the window, so a size read before the move would be stale.
        let size = main_window.outer_size().map_err(|e| e.to_string())?;
        if size.width as i32 != bounds.width || size.height as i32 != bounds.height {
            main_window
                .set_size(tauri::PhysicalSize::new(
                    bounds.width as u32,
                    bounds.height as u32,
                ))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

/// Origin of the virtual webview canvas. The native host may be a small window far from this origin.
#[tauri::command]
pub fn get_overlay_viewport(app_handle: tauri::AppHandle) -> Option<window::WindowRect> {
    window::get_appropriate_window_bounds(&app_handle)
}

/// An explicit tray/menu/hotkey action may bring existing UI forward without claiming the keyboard.
#[tauri::command]
pub fn raise_overlay(overlay: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            IsWindowVisible, SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };
        let hwnd = overlay.hwnd().map_err(|e| e.to_string())?.0 as isize;
        unsafe {
            if IsWindowVisible(hwnd) != 0
                && SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
                ) == 0
            {
                return Err("Failed to raise the overlay".into());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn start_chat_watcher(
    app_handle: tauri::AppHandle,
    custom_d2_dir: Option<String>,
) -> Result<(), String> {
    chat_watcher::start_watching(app_handle, custom_d2_dir)
}

#[tauri::command]
pub fn stop_chat_watcher() -> Result<(), String> {
    chat_watcher::stop_watching()
}

#[tauri::command]
pub fn get_diablo2_directory(custom_path: Option<String>) -> Option<String> {
    chat_watcher::find_diablo2_directory(custom_path.as_deref())
        .and_then(|p| p.to_str().map(|s| s.to_string()))
}

#[tauri::command]
pub fn auto_detect_diablo2_directory() -> Option<String> {
    chat_watcher::auto_detect_diablo2_directory().and_then(|p| p.to_str().map(|s| s.to_string()))
}

#[tauri::command]
pub fn write_debug_logs(entries: String) -> Result<(), String> {
    debug_logger::write_logs(&entries)
}

#[tauri::command]
pub async fn open_oauth_url(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Invalid URL scheme: only HTTP(S) is allowed".to_string());
    }

    app_handle
        .opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}
