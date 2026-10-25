//! Native regression probe for a hidden small host followed by a keyboard-focus claim.
//! Run with scripts/test-overlay-visibility.ps1, which embeds the required Common Controls v6
//! manifest before launch. Uses a real Windows message loop without a WebView, game or account.
#[cfg(target_os = "windows")]
fn main() {
    use std::sync::{
        atomic::{AtomicI32, Ordering},
        mpsc, Arc,
    };
    use std::time::Duration;
    use tauri::{AppHandle, Window, WindowBuilder};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, IsWindowVisible, ShowWindow, SW_SHOWNOACTIVATE,
    };

    fn snapshot(app: &AppHandle, window: &Window, label: &str) -> Result<(bool, isize), String> {
        let (send, receive) = mpsc::channel();
        let target = window.clone();
        app.run_on_main_thread(move || {
            let hwnd = target.hwnd().unwrap().0 as isize;
            let mut rect = unsafe { std::mem::zeroed() };
            unsafe {
                GetWindowRect(hwnd, &mut rect);
            }
            let _ = send.send((
                unsafe { IsWindowVisible(hwnd) != 0 },
                unsafe { GetForegroundWindow() },
                rect,
            ));
        })
        .map_err(|e| e.to_string())?;
        let (visible, foreground, rect) = receive
            .recv_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        println!(
            "{} visible={} bounds={}x{} foreground={}",
            label,
            visible,
            rect.right - rect.left,
            rect.bottom - rect.top,
            foreground
        );
        if rect.right - rect.left > 512 || rect.bottom - rect.top > 128 {
            return Err("Probe host expanded beyond its small test bounds".into());
        }
        Ok((visible, foreground))
    }

    fn probe(app: &AppHandle, window: &Window) -> Result<(), String> {
        if snapshot(app, window, "initial-hidden")?.0 {
            return Err("Expected hidden initial host".into());
        }
        let target = window.clone();
        app.run_on_main_thread(move || unsafe {
            ShowWindow(target.hwnd().unwrap().0 as isize, SW_SHOWNOACTIVATE);
        })
        .map_err(|e| e.to_string())?;
        if !snapshot(app, window, "legacy-raw-show")?.0 {
            return Err("Raw show failed".into());
        }
        window.set_focusable(true).map_err(|e| e.to_string())?;
        if snapshot(app, window, "legacy-after-focusable")?.0 {
            return Err("Legacy desynchronized-visibility failure was not reproduced".into());
        }
        println!("REPRODUCED: raw ShowWindow followed by set_focusable hides the host");

        for cycle in 0..10 {
            window.hide().map_err(|e| e.to_string())?;
            window.set_focusable(false).map_err(|e| e.to_string())?;
            let before = snapshot(app, window, "managed-hidden")?.1;
            window.show().map_err(|e| e.to_string())?;
            let shown = snapshot(app, window, "managed-show")?;
            if !shown.0 {
                return Err(format!("Managed show failed, cycle {}", cycle));
            }
            if before != 0 && shown.1 != before {
                return Err("Passive show unexpectedly changed the foreground window".into());
            }
            window.set_focusable(true).map_err(|e| e.to_string())?;
            window
                .set_ignore_cursor_events(true)
                .map_err(|e| e.to_string())?;
            window
                .set_ignore_cursor_events(false)
                .map_err(|e| e.to_string())?;
            if !snapshot(app, window, "managed-after-style-updates")?.0 {
                return Err(format!(
                    "Style updates hid the managed host, cycle {}",
                    cycle
                ));
            }
        }
        println!("PASS: 10 native hide/show/focusable/cursor cycles retained visibility and small bounds");
        Ok(())
    }

    let result = Arc::new(AtomicI32::new(1));
    let exit_result = result.clone();
    tauri::Builder::default()
        .setup(move |app| {
            let window = WindowBuilder::new(app, "visibility-probe")
                .title("PD2 small window visibility probe")
                .inner_size(32.0, 32.0)
                .position(0.0, 0.0)
                .decorations(false)
                .transparent(true)
                .visible(false)
                .focused(false)
                .focusable(false)
                .resizable(false)
                .minimizable(false)
                .maximizable(false)
                .skip_taskbar(true)
                .shadow(false)
                .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || match probe(&handle, &window) {
                Ok(()) => {
                    exit_result.store(0, Ordering::SeqCst);
                    handle.exit(0);
                }
                Err(error) => {
                    eprintln!("FAIL: {}", error);
                    handle.exit(1);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Visibility probe failed to run");
    std::process::exit(result.load(Ordering::SeqCst));
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("This probe requires Windows");
}
