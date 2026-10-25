use tauri::webview::PageLoadEvent;
#[cfg(not(target_os = "windows"))]
use tauri::WebviewWindowBuilder;
use tauri::{Manager, WebviewUrl};
#[cfg(target_os = "windows")]
use tauri::{WebviewBuilder, WindowBuilder};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub mod modules;

// Re-export modules for easier access
pub use modules::{chat_watcher, commands, debug_logger, keyboard, region, system, window};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    if !system::is_elevated() {
        system::restart_as_admin();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_window(&modules::config::WINDOW_CONFIG.labels.Main)
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_app_exit::init())
        // Shortcuts registered by the page call back into it; after a reload they'd stay registered but
        // call into the dead page (and block re-registering). Rust registers none itself, so clear them all.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started
                && webview.label() == modules::config::WINDOW_CONFIG.labels.Main
            {
                if let Err(e) = webview.app_handle().global_shortcut().unregister_all() {
                    eprintln!("Failed to clear global shortcuts on page load: {}", e);
                }
            }
        })
        .setup(|app| {
            // Initialize debug logger with app config directory
            if let Ok(config_dir) = app.path().app_config_dir() {
                debug_logger::init(config_dir);
            }

            let (x, y, width, height) =
                match window::get_appropriate_window_bounds(app.app_handle()) {
                    Some(rect) => (
                        rect.x as f64,
                        rect.y as f64,
                        rect.width as f64,
                        rect.height as f64,
                    ),
                    None => {
                        eprintln!("Warning: Using default window bounds.");
                        (0.0, 0.0, 1920.0, 1080.0)
                    }
                };

            // Windows: the native host starts hidden at 1x1, then fits only the visible UI. The
            // child webview keeps a stable virtual work-area canvas so panel coordinates and poppers
            // don't change as the native host shrinks around a dock/menu/panel.
            #[cfg(target_os = "windows")]
            let main_window = WindowBuilder::new(app, &modules::config::WINDOW_CONFIG.labels.Main)
                .title(&modules::config::WINDOW_CONFIG.titles.Main)
                .inner_size(1.0, 1.0)
                .position(x, y)
                .decorations(false)
                .transparent(true)
                .visible(false)
                .focused(false)
                .focusable(false)
                .resizable(false)
                .shadow(false)
                .always_on_top(false)
                .skip_taskbar(true)
                .build()?;
            #[cfg(target_os = "windows")]
            let main_webview = main_window.add_child(
                WebviewBuilder::new(
                    &modules::config::WINDOW_CONFIG.labels.Main,
                    WebviewUrl::default(),
                )
                .transparent(true)
                .focused(false),
                tauri::PhysicalPosition::new(0, 0),
                tauri::PhysicalSize::new(width as u32, height as u32),
            )?;
            #[cfg(target_os = "windows")]
            main_webview.set_auto_resize(false)?;

            #[cfg(not(target_os = "windows"))]
            let main_window = WebviewWindowBuilder::new(
                app,
                &modules::config::WINDOW_CONFIG.labels.Main,
                WebviewUrl::default(),
            )
            .title(&modules::config::WINDOW_CONFIG.titles.Main)
            .inner_size(width, height)
            .position(x, y)
            .decorations(false)
            .transparent(true)
            .visible(true)
            .focused(false)
            .focusable(false)
            .resizable(false)
            .shadow(false)
            .always_on_top(false)
            .skip_taskbar(true)
            .build()?;

            // The foreground tracking tells the overlay apart from our other windows (tray menu owner).
            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = main_window.hwnd() {
                window::set_overlay_window(hwnd.0 as isize);
            }
            // Click-through until the frontend reports its interactive rects.
            if let Err(e) = region::apply_region(&app.get_window(main_window.label()).unwrap(), &[])
            {
                eprintln!("Failed to seed empty interactive region: {}", e);
                let _ = main_window.hide();
            }
            // Refresh the virtual work area; Windows keeps the native host hidden until content exists.
            let _ = commands::update_window_bounds(app.app_handle().clone());

            // Game focus context (emits `diablo-focus-changed`, see window::focus); re-fit the overlay
            // to the monitor Diablo is on.
            let app_handle_bounds = app.app_handle().clone();
            window::initialize_diablo_focus_monitoring(
                app.app_handle().clone(),
                Box::new(move |_in_game| {
                    if let Err(error) = commands::update_window_bounds(app_handle_bounds.clone()) {
                        debug_logger::overlay_trace(&format!("native recovery failed: {}", error));
                    }
                }),
            );

            #[cfg(all(debug_assertions, not(target_os = "windows")))]
            main_window.open_devtools();
            #[cfg(all(debug_assertions, target_os = "windows"))]
            main_webview.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_game_item_clipboard,
            commands::get_diablo_rect,
            commands::get_overlay_viewport,
            commands::press_key,
            commands::is_diablo_focused,
            debug_logger::report_overlay_health,
            commands::get_foreground_owner,
            commands::set_overlay_z_order,
            commands::raise_overlay,
            commands::focus_diablo,
            commands::focus_overlay,
            commands::set_outside_click_watch,
            commands::update_window_bounds,
            region::set_interactive_region,
            commands::start_chat_watcher,
            commands::stop_chat_watcher,
            commands::get_diablo2_directory,
            commands::auto_detect_diablo2_directory,
            commands::open_oauth_url,
            commands::write_debug_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
