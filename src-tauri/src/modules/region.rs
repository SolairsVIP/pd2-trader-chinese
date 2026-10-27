//! Visible/input regions of the overlay. On Windows the native host is sized to the
//! bounding box of visible content, never to the virtual canvas by default.

use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Window};

/// Rects of the region last applied to the Main window, for hit-testing clicks (see window::outside_click).
static CURRENT: Mutex<Vec<RegionRect>> = Mutex::new(Vec::new());

/// Point (physical pixels, relative to the Main window) on one of its interactive rects. Unknown counts as
/// inside, so nothing closes on a guess.
pub fn contains(x: i32, y: i32) -> bool {
    CURRENT
        .lock()
        .map(|rects| rects_contain(&rects, x, y))
        .unwrap_or(true)
}

fn rects_contain(rects: &[RegionRect], x: i32, y: i32) -> bool {
    rects
        .iter()
        .any(|r| x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)
}

/// Rect in physical pixels relative to the virtual work-area canvas (host-local inside CURRENT).
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct RegionRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[tauri::command]
pub fn set_interactive_region(app_handle: AppHandle, rects: Vec<RegionRect>) -> Result<(), String> {
    let window = app_handle
        .get_window(&crate::modules::config::WINDOW_CONFIG.labels.Main)
        .ok_or("Main window not found")?;
    apply_region(&window, &rects)
}

#[cfg(target_os = "windows")]
static VIRTUAL_RECTS: Mutex<Vec<RegionRect>> = Mutex::new(Vec::new());

/// Clamp untrusted frontend rectangles to the virtual work area before sizing a native window.
fn clipped_rects(rects: &[RegionRect], width: i32, height: i32) -> Vec<RegionRect> {
    rects
        .iter()
        .filter_map(|r| {
            if r.width <= 0 || r.height <= 0 {
                return None;
            }
            let left = r.x.max(0);
            let top = r.y.max(0);
            let right = r.x.saturating_add(r.width).min(width);
            let bottom = r.y.saturating_add(r.height).min(height);
            (right > left && bottom > top).then_some(RegionRect {
                x: left,
                y: top,
                width: right.saturating_sub(left),
                height: bottom.saturating_sub(top),
            })
        })
        .collect()
}

fn bounding_rect(rects: &[RegionRect]) -> Option<RegionRect> {
    let first = *rects.first()?;
    let (mut left, mut top) = (first.x, first.y);
    let (mut right, mut bottom) = (first.x + first.width, first.y + first.height);
    for r in &rects[1..] {
        left = left.min(r.x);
        top = top.min(r.y);
        right = right.max(r.x + r.width);
        bottom = bottom.max(r.y + r.height);
    }
    Some(RegionRect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

#[cfg(target_os = "windows")]
pub fn refresh_window_bounds(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window(&crate::modules::config::WINDOW_CONFIG.labels.Main)
        .ok_or("Main window not found")?;
    let rects = VIRTUAL_RECTS
        .lock()
        .map_err(|_| "Region lock poisoned")?
        .clone();
    apply_region(&window, &rects)?;
    // The raw foreground hook can demote us even if React never observed the brief blur.
    // Re-entry must repair z-order natively, including when React's boolean did not change.
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    crate::window::set_overlay_z_order(hwnd, crate::window::is_game_context())
}

#[cfg(target_os = "windows")]
pub fn apply_region(window: &Window, rects: &[RegionRect]) -> Result<(), String> {
    *VIRTUAL_RECTS.lock().map_err(|_| "Region lock poisoned")? = rects.to_vec();
    let result = apply_small_window_region(window, rects);
    if let Err(error) = &result {
        // Fail closed: a missing/invalid clip must never leave a desktop-sized visible overlay.
        let _ = window.hide();
        if let Ok(mut current) = CURRENT.lock() {
            current.clear();
        }
        let _ = crate::debug_logger::write_logs(&format!(
            "[overlay] small-window update failed; host hidden: {}\n",
            error
        ));
    }
    result
}

#[cfg(target_os = "windows")]
fn apply_small_window_region(window: &Window, rects: &[RegionRect]) -> Result<(), String> {
    use windows_sys::Win32::Graphics::Gdi::{
        CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, ERROR, RGN_OR,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, IsWindowVisible, SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_NOZORDER,
    };

    let workspace = crate::window::get_appropriate_window_bounds(window.app_handle())
        .ok_or("Monitor work area unavailable")?;
    let webview = window
        .app_handle()
        .get_webview(window.label())
        .ok_or("Main webview not found")?;
    let rects = clipped_rects(rects, workspace.width, workspace.height);
    let Some(crop) = bounding_rect(&rects) else {
        // A hidden parent makes recovery depend on its hidden renderer committing the next region.
        // In game context, wake the renderer with a click-through 1px host before emitting focus.
        // Outside the game it stays hidden; this never creates a desktop-sized native window.
        if crate::window::is_game_context() {
            let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
            window
                .set_ignore_cursor_events(true)
                .map_err(|e| e.to_string())?;
            unsafe {
                let tiny = CreateRectRgn(0, 0, 1, 1);
                if tiny == 0 {
                    return Err("Failed to create renderer wake region".into());
                }
                if SetWindowRgn(hwnd, tiny, 0) == 0 {
                    DeleteObject(tiny);
                    return Err("Failed to apply renderer wake region".into());
                }
                if SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    workspace.x,
                    workspace.y,
                    1,
                    1,
                    SWP_NOACTIVATE,
                ) == 0
                {
                    return Err("Failed to size renderer wake host".into());
                }
            }
            // Keep Tao's VISIBLE flag in sync with Windows. Raw ShowWindow leaves the
            // framework believing this host is hidden; a later set_focusable/style update
            // then reapplies SW_HIDE. The host was created focused(false), so the backend
            // uses SW_SHOWNOACTIVATE for this managed show.
            window.show().map_err(|e| e.to_string())?;
            webview.show().map_err(|e| e.to_string())?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
        webview
            .set_bounds(tauri::Rect {
                position: tauri::PhysicalPosition::new(0, 0).into(),
                size: tauri::PhysicalSize::new(workspace.width as u32, workspace.height as u32)
                    .into(),
            })
            .map_err(|e| e.to_string())?;
        if let Ok(mut current) = CURRENT.lock() {
            current.clear();
        }
        trace_region(window, None);
        return Ok(());
    };
    let local: Vec<RegionRect> = rects
        .iter()
        .map(|r| RegionRect {
            x: r.x - crop.x,
            y: r.y - crop.y,
            ..*r
        })
        .collect();
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| e.to_string())?;
    webview.show().map_err(|e| e.to_string())?;
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region == 0 {
            return Err("CreateRectRgn failed".into());
        }
        for r in &local {
            let rect_region = CreateRectRgn(r.x, r.y, r.x + r.width, r.y + r.height);
            if rect_region == 0 {
                DeleteObject(region);
                return Err("CreateRectRgn failed for panel".into());
            }
            let combined = CombineRgn(region, region, rect_region, RGN_OR);
            DeleteObject(rect_region);
            if combined == ERROR {
                DeleteObject(region);
                return Err("CombineRgn failed".into());
            }
        }

        // Keep the previous bounded shape while moving. Replacing it with an empty region on
        // every drag frame briefly hides the host and causes visible flicker. The host is always
        // clipped to its window bounds, and is resized to the new content bounds below before
        // the new region is applied, so this transition cannot expose the full virtual canvas.
        let mut old: windows_sys::Win32::Foundation::RECT = std::mem::zeroed();
        let x = workspace.x + crop.x;
        let y = workspace.y + crop.y;
        if GetWindowRect(hwnd, &mut old) == 0
            || old.left != x
            || old.top != y
            || old.right - old.left != crop.width
            || old.bottom - old.top != crop.height
        {
            if SetWindowPos(
                hwnd,
                0,
                x,
                y,
                crop.width,
                crop.height,
                SWP_NOACTIVATE | SWP_NOZORDER,
            ) == 0
            {
                DeleteObject(region);
                return Err("Failed to fit native host to visible content".into());
            }
        }

        // A child webview (not WebviewWindow) is essential: Wry's normal parent WM_SIZE
        // handler would otherwise resize the webview back to the small host and shift every panel.
        if let Err(error) = webview.set_bounds(tauri::Rect {
            position: tauri::PhysicalPosition::new(-crop.x, -crop.y).into(),
            size: tauri::PhysicalSize::new(workspace.width as u32, workspace.height as u32).into(),
        }) {
            DeleteObject(region);
            return Err(error.to_string());
        }
        // On success the system owns `region`; only free it on failure.
        if SetWindowRgn(hwnd, region, 1) == 0 {
            DeleteObject(region);
            return Err("SetWindowRgn failed".into());
        }
        if IsWindowVisible(hwnd) == 0 {
            // Explicitly opened UI (including Settings from the tray) appears above normal windows,
            // without taking keyboard focus. Subsequent external activation demotes it immediately.
            SetWindowPos(
                hwnd,
                HWND_TOP,
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
            );
        }
    }
    // Synchronize framework visibility even when the OS window already happens to be shown.
    // Only show after the bounded geometry and region have both been applied.
    window.show().map_err(|e| e.to_string())?;
    if let Ok(mut current) = CURRENT.lock() {
        *current = local;
    }
    trace_region(window, Some(crop));
    Ok(())
}

#[cfg(target_os = "windows")]
fn trace_region(window: &Window, crop: Option<RegionRect>) {
    static LAST: Mutex<Option<(bool, Option<RegionRect>)>> = Mutex::new(None);
    let snapshot = (window.is_visible().unwrap_or(false), crop);
    let mut last = LAST.lock().unwrap_or_else(|p| p.into_inner());
    if *last != Some(snapshot) {
        crate::debug_logger::overlay_trace(&format!(
            "region visible={} crop={:?}",
            snapshot.0, crop
        ));
        *last = Some(snapshot);
    }
}

#[cfg(target_os = "linux")]
pub fn apply_region(window: &Window, rects: &[RegionRect]) -> Result<(), String> {
    use gtk::cairo::{RectangleInt, Region};
    use gtk::prelude::WidgetExt;

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    // GTK input shapes are in logical (device-independent) pixels.
    let mut logical: Vec<RectangleInt> = rects
        .iter()
        .filter(|r| r.width > 0 && r.height > 0)
        .map(|r| {
            let left = (r.x as f64 / scale).floor() as i32;
            let top = (r.y as f64 / scale).floor() as i32;
            let right = ((r.x + r.width) as f64 / scale).ceil() as i32;
            let bottom = ((r.y + r.height) as f64 / scale).ceil() as i32;
            RectangleInt::new(left, top, right - left, bottom - top)
        })
        .collect();
    if logical.is_empty() {
        // An empty input shape means "no shape" (whole window clickable) on X11;
        // use a 1x1 rect like tao's set_ignore_cursor_events.
        logical.push(RectangleInt::new(0, 0, 1, 1));
    }

    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let Ok(gtk_window) = target.gtk_window() else {
                return;
            };
            let region = Region::create_rectangles(&logical);
            gtk_window.input_shape_combine_region(Some(&region));
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub fn apply_region(_window: &Window, _rects: &[RegionRect]) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn rect(x: i32, y: i32, width: i32, height: i32) -> RegionRect {
        RegionRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn hit_tests_the_interactive_rects() {
        let rects = [rect(10, 10, 100, 50), rect(300, 0, 20, 20)];
        assert!(rects_contain(&rects, 10, 10));
        assert!(rects_contain(&rects, 109, 59));
        assert!(!rects_contain(&rects, 110, 30)); // right edge is exclusive
        assert!(!rects_contain(&rects, 200, 30)); // between panels: the game
        assert!(rects_contain(&rects, 305, 5));
    }

    #[test]
    fn no_panels_means_every_click_is_outside() {
        assert!(!rects_contain(&[], 0, 0));
    }

    #[test]
    fn dock_only_uses_a_small_native_host() {
        let dock = rect(1800, 800, 60, 230);
        assert_eq!(
            bounding_rect(&clipped_rects(&[dock], 1920, 1080)),
            Some(dock)
        );
    }

    #[test]
    fn top_zone_strip_and_bottom_dock_leave_the_game_between_them_click_through() {
        let strip = rect(760, 8, 400, 32);
        let dock = rect(1800, 800, 60, 230);
        let expanded = rect(760, 8, 400, 240);
        let open = clipped_rects(&[expanded, dock], 1920, 1080);
        assert!(rects_contain(&open, 800, 200));
        let collapsed = clipped_rects(&[strip, dock], 1920, 1080);
        let crop = bounding_rect(&collapsed).unwrap();
        let local: Vec<_> = collapsed.iter()
            .map(|r| rect(r.x - crop.x, r.y - crop.y, r.width, r.height))
            .collect();
        assert!(rects_contain(&local, 800 - crop.x, 20 - crop.y));
        assert!(rects_contain(&local, 1820 - crop.x, 900 - crop.y));
        assert!(!rects_contain(&local, 800 - crop.x, 200 - crop.y));
        assert!(!rects_contain(&local, 1300 - crop.x, 500 - crop.y));
        assert!(!rects_contain(&local, 1700 - crop.x, 900 - crop.y));
    }

    #[test]
    fn menu_expands_the_host_and_closing_it_shrinks_it_again() {
        let dock = rect(1800, 800, 60, 230);
        let menu = rect(1650, 450, 210, 340);
        let open = clipped_rects(&[dock, menu], 1920, 1080);
        assert_eq!(bounding_rect(&open), Some(rect(1650, 450, 210, 580)));
        assert_eq!(
            bounding_rect(&clipped_rects(&[dock], 1920, 1080)),
            Some(dock)
        );
        // Native hit testing uses host-local coordinates, including the hole between menu and dock.
        let local: Vec<_> = open
            .iter()
            .map(|r| rect(r.x - 1650, r.y - 450, r.width, r.height))
            .collect();
        assert!(rects_contain(&local, 10, 10));
        assert!(!rects_contain(&local, 10, 400));
        assert!(rects_contain(&local, 160, 400));
    }

    #[test]
    fn clips_offscreen_and_overflowing_rects_before_computing_the_host() {
        assert_eq!(
            clipped_rects(
                &[
                    rect(-10, -20, 40, 50),
                    rect(1900, 1060, i32::MAX, i32::MAX),
                    rect(i32::MAX, 0, i32::MAX, 10),
                    rect(10, 10, -1, 20),
                ],
                1920,
                1080
            ),
            vec![rect(0, 0, 30, 30), rect(1900, 1060, 20, 20)]
        );
    }

    #[test]
    fn no_visible_content_has_no_native_bounds() {
        assert_eq!(bounding_rect(&[]), None);
        assert_eq!(
            bounding_rect(&clipped_rects(&[rect(-100, 0, 20, 20)], 1920, 1080)),
            None
        );
    }

    #[test]
    fn settings_only_does_not_use_monitor_sized_bounds() {
        let settings = rect(400, 150, 1025, 700);
        assert_eq!(
            bounding_rect(&clipped_rects(&[settings], 2560, 1440)),
            Some(settings)
        );
    }
}
