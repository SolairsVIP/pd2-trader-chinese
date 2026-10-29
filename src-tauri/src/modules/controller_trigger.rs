#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_sony_compatible_hid_reports_only() {
        assert!(is_supported_controller_vendor(0x054c));
        assert!(!is_supported_controller_vendor(0x045e));
    }

    #[test]
    fn dualshock_and_dualsense_reports_detect_triggers() {
        assert_eq!(
            triggers(0x05c4, &[1, 0, 0, 0, 0, 0, 0, 0, 200, 201]),
            Some((200, 201))
        );
        assert_eq!(
            triggers(0x0ce6, &[1, 0, 0, 0, 0, 200, 201]),
            Some((200, 201))
        );
        assert_eq!(
            triggers(0x0ce6, &[0x31, 0, 0, 0, 0, 0, 200, 201]),
            Some((200, 201))
        );
        assert_eq!(triggers(0x05c4, &[1]), None);
    }

    #[test]
    fn fires_once_and_requires_release_after_activation() {
        let mut latch = TriggerLatch::default();
        assert_eq!(latch.update(false, 255, 255, 0), None);
        assert_eq!(latch.update(true, 255, 255, 1), None);
        assert_eq!(latch.update(true, 0, 0, 2), None);
        assert_eq!(latch.update(true, 255, 255, 10), None);
        assert_eq!(latch.update(true, 255, 255, 300), None);
        assert_eq!(latch.update(true, 0, 255, 400), Some(TriggerAction::PriceCheck));
        assert_eq!(latch.update(true, 255, 255, 500), None);
        assert_eq!(latch.update(true, 0, 0, 600), None);
        assert_eq!(latch.update(true, 255, 255, 700), None);
        assert_eq!(latch.tick(true, 1500), Some(TriggerAction::Menu));
        assert_eq!(latch.tick(true, 1600), None);
        assert_eq!(latch.update(true, 0, 0, 1700), None);
        assert_eq!(latch.update(true, 255, 255, 1800), None);
        assert_eq!(latch.update(false, 0, 0, 1900), None);
    }

    #[test]
    fn long_hold_does_not_fire_after_focus_loss() {
        let mut latch = TriggerLatch::default();
        latch.update(true, 0, 0, 0);
        latch.update(true, 255, 255, 100);
        assert_eq!(latch.tick(false, 1000), None);
        assert_eq!(latch.update(true, 0, 0, 1100), None);
    }

    #[test]
    fn menu_buttons_parse_and_fire_only_on_new_presses() {
        let mut latch = MenuLatch::default();
        let neutral = menu_buttons(0x05c4, &[1, 0, 0, 0, 0, 8]).unwrap();
        assert!(latch.update(neutral, true).is_empty());
        let pressed = menu_buttons(0x05c4, &[1, 0, 0, 0, 0, 0x20]).unwrap();
        assert_eq!(latch.update(pressed, true), vec!["up", "confirm"]);
        assert!(latch.update(pressed, true).is_empty());
        assert!(latch.update(neutral, true).is_empty());
        assert_eq!(latch.update(menu_buttons(0x0ce6, &[1, 0, 0, 0, 0, 0, 0, 0, 0x42]).unwrap(), true), vec!["right"]);
        assert_eq!(latch.update(menu_buttons(0x0ce6, &[1, 0, 0, 0, 0, 0, 0, 0, 0x08]).unwrap(), true), vec!["close"]);
        assert!(latch.update(menu_buttons(0x0ce6, &[1, 0, 0, 0, 0, 0, 0, 0, 0x08]).unwrap(), true).is_empty());
        assert!(menu_buttons(0x0ce6, &[1]).is_none());
    }

    #[test]
    fn shoulder_buttons_switch_tabs_once_per_press_for_sony_reports() {
        let mut latch = MenuLatch::default();
        let neutral = menu_buttons(0x05c4, &[1, 0, 0, 0, 0, 8, 0]).unwrap();
        latch.update(neutral, true);
        let l1 = menu_buttons(0x05c4, &[1, 0, 0, 0, 0, 8, 1]).unwrap();
        assert_eq!(latch.update(l1, true), vec!["tab-previous"]);
        assert!(latch.update(l1, true).is_empty());
        latch.update(neutral, true);
        let r1 = menu_buttons(0x0ce6, &[1, 0, 0, 0, 0, 0, 0, 0, 8, 2]).unwrap();
        assert_eq!(latch.update(r1, true), vec!["tab-next"]);
        latch.update(neutral, false);
        assert!(latch.update(r1, false).is_empty());
        assert!(latch.update(r1, true).is_empty());
    }

    #[test]
    fn reads_left_stick_for_wired_and_wireless_sony_reports() {
        assert_eq!(left_stick(0x05c4, &[1, 12, 240]), Some((12, 240)));
        assert_eq!(left_stick(0x05c4, &[0x11, 0, 0, 12, 240]), Some((12, 240)));
        assert_eq!(left_stick(0x0ce6, &[1, 12, 240]), Some((12, 240)));
        assert_eq!(left_stick(0x0ce6, &[0x31, 0, 12, 240]), Some((12, 240)));
        assert_eq!(left_stick(0x0ce6, &[1]), None);
    }

    #[test]
    fn reads_right_stick_y_for_wired_and_wireless_sony_reports() {
        assert_eq!(right_stick_y(0x05c4, &[1, 0, 0, 0, 222]), Some(222));
        assert_eq!(right_stick_y(0x05c4, &[0x11, 0, 0, 0, 0, 0, 222]), Some(222));
        assert_eq!(right_stick_y(0x0ce6, &[1, 0, 0, 0, 222]), Some(222));
        assert_eq!(right_stick_y(0x0ce6, &[0x31, 0, 0, 0, 0, 222]), Some(222));
        assert_eq!(right_stick_y(0x0ce6, &[1]), None);
    }

    #[test]
    fn circle_release_does_not_close_if_pressed_outside_overlay() {
        let mut latch = MenuLatch::default();
        assert!(latch.update(32, false).is_empty());
        assert!(latch.update(0, true).is_empty());
        assert!(latch.update(32, true).is_empty());
        assert!(latch.update(32, false).is_empty());
        assert!(latch.update(0, true).is_empty());
    }

    #[test]
    fn xbox_price_check_only_fires_once_per_trigger_chord() {
        let mut latch = XboxPriceTrigger::default();
        assert!(!latch.update(false, 255, 255));
        assert!(!latch.update(true, 255, 255));
        assert!(!latch.update(true, 0, 0));
        assert!(latch.update(true, 255, 255));
        assert!(!latch.update(true, 255, 255));
        assert!(!latch.update(true, 0, 255));
        assert!(!latch.update(true, 255, 255));
        assert!(!latch.update(true, 0, 0));
        assert!(latch.update(true, 255, 255));
    }

    #[test]
    fn xbox_b_returns_on_release_and_other_menu_controls_are_not_mapped() {
        let mut latch = MenuLatch::default();
        assert!(latch.update(xinput_price_buttons(0x2000), true).is_empty());
        assert_eq!(latch.update(xinput_price_buttons(0), true), vec!["close"]);
        assert_eq!(latch.update(xinput_price_buttons(0x1000), true), vec!["confirm"]);
        assert_eq!(xinput_price_buttons(0x0100 | 0x0200), 0);
        assert!(latch.update(xinput_price_buttons(0x2000), false).is_empty());
        assert!(latch.update(xinput_price_buttons(0), true).is_empty());
    }

    #[test]
    fn xbox_sticks_use_the_same_coordinate_system_as_sony_sticks() {
        assert_eq!(xinput_axis(0, false), 128);
        assert_eq!(xinput_axis(i16::MIN, false), 0);
        assert_eq!(xinput_axis(i16::MAX, false), 255);
        assert_eq!(xinput_axis(i16::MAX, true), 0);
        assert_eq!(xinput_axis(i16::MIN, true), 255);
    }

}

fn is_supported_controller_vendor(vendor: u32) -> bool { vendor == 0x054c }

#[derive(Default)]
struct XboxPriceTrigger { armed: bool }

impl XboxPriceTrigger {
    fn update(&mut self, active: bool, left: u8, right: u8) -> bool {
        if !active { self.armed = false; return false; }
        if left < 30 && right < 30 { self.armed = true; return false; }
        if self.armed && left >= 180 && right >= 180 {
            self.armed = false;
            return true;
        }
        false
    }
}

fn xinput_price_buttons(buttons: u16) -> u8 {
    (if buttons & 0x0001 != 0 { 1 } else { 0 }) |
    (if buttons & 0x0002 != 0 { 2 } else { 0 }) |
    (if buttons & 0x1000 != 0 { 16 } else { 0 }) |
    (if buttons & 0x2000 != 0 { 32 } else { 0 })
}

fn xinput_axis(value: i16, invert: bool) -> u8 {
    let scaled = ((i32::from(value) + 32768) * 255 + 32767) / 65535;
    if invert { (255 - scaled) as u8 } else { scaled as u8 }
}

#[derive(Default)]
struct MenuLatch { previous: u8, close_armed: bool }

impl MenuLatch {
    fn update(&mut self, buttons: u8, active: bool) -> Vec<&'static str> {
        let fresh = buttons & !self.previous;
        if !active { self.close_armed = false; }
        else if fresh & 32 != 0 { self.close_armed = true; }
        let released_close = active && self.close_armed && self.previous & 32 != 0 && buttons & 32 == 0;
        if buttons & 32 == 0 { self.close_armed = false; }
        self.previous = buttons;
        if !active { return Vec::new(); }
        let mut actions: Vec<_> = [(1, "up"), (2, "down"), (4, "left"), (8, "right"), (16, "confirm"), (64, "tab-previous"), (128, "tab-next")]
            .into_iter().filter_map(|(bit, name)| (fresh & bit != 0).then_some(name)).collect();
        if released_close { actions.push("close"); }
        actions
    }
}

fn menu_buttons(product: u32, data: &[u8]) -> Option<u8> {
    let offset = match (product, *data.first()?) {
        (0x05c4 | 0x09cc | 0x0ba0, 0x01) => 5,
        (0x05c4 | 0x09cc | 0x0ba0, 0x11) => 7,
        (0x0ce6 | 0x0df2, 0x01) => 8,
        (0x0ce6 | 0x0df2, 0x31) => 9,
        _ => return None,
    };
    let buttons = *data.get(offset)?;
    let direction = match buttons & 0x0f {
        0 => 1, 1 => 1 | 8, 2 => 8, 3 => 2 | 8,
        4 => 2, 5 => 2 | 4, 6 => 4, 7 => 1 | 4, _ => 0,
    };
    let shoulders = data.get(offset + 1).copied().unwrap_or(0);
    Some(direction | if buttons & 0x20 != 0 { 16 } else { 0 } | if buttons & 0x40 != 0 { 32 } else { 0 }
        | if shoulders & 0x01 != 0 { 64 } else { 0 } | if shoulders & 0x02 != 0 { 128 } else { 0 })
}

fn left_stick(product: u32, data: &[u8]) -> Option<(u8, u8)> {
    let offset = match (product, *data.first()?) {
        (0x05c4 | 0x09cc | 0x0ba0, 0x01) | (0x0ce6 | 0x0df2, 0x01) => 1,
        (0x05c4 | 0x09cc | 0x0ba0, 0x11) => 3,
        (0x0ce6 | 0x0df2, 0x31) => 2,
        _ => return None,
    };
    Some((*data.get(offset)?, *data.get(offset + 1)?))
}
fn right_stick_y(product: u32, data: &[u8]) -> Option<u8> {
    let offset = match (product, *data.first()?) {
        (0x05c4 | 0x09cc | 0x0ba0, 0x01) | (0x0ce6 | 0x0df2, 0x01) => 4,
        (0x05c4 | 0x09cc | 0x0ba0, 0x11) => 6,
        (0x0ce6 | 0x0df2, 0x31) => 5,
        _ => return None,
    };
    data.get(offset).copied()
}
#[derive(Default)]
struct TriggerLatch {
    armed: bool,
    started: Option<u64>,
    long_fired: bool,
}

#[derive(Debug, PartialEq, Eq)]
enum TriggerAction { PriceCheck, Menu }

impl TriggerLatch {
    fn tick(&mut self, active: bool, now: u64) -> Option<TriggerAction> {
        if !active {
            *self = Self::default();
            return None;
        }
        if !self.long_fired && self.started.is_some_and(|start| now.saturating_sub(start) >= 800) {
            self.long_fired = true;
            return Some(TriggerAction::Menu);
        }
        None
    }
    fn update(&mut self, active: bool, left: u8, right: u8, now: u64) -> Option<TriggerAction> {
        if !active { return self.tick(false, now); }
        if self.started.is_some() && (left < 180 || right < 180) {
            let result = if self.long_fired { None } else if now.saturating_sub(self.started.unwrap()) >= 800 { Some(TriggerAction::Menu) } else { Some(TriggerAction::PriceCheck) };
            self.started = None;
            self.long_fired = false;
            self.armed = left < 30 && right < 30;
            return result;
        }
        if left < 30 && right < 30 {
            self.armed = true;
            return None;
        }
        if self.armed && left >= 180 && right >= 180 {
            self.armed = false;
            self.started = Some(now);
        }
        self.tick(true, now)
    }
}

fn triggers(product: u32, data: &[u8]) -> Option<(u8, u8)> {
    let offset = match (product, *data.first()?) {
        (0x05c4 | 0x09cc | 0x0ba0, 0x01) => 8,
        (0x05c4 | 0x09cc | 0x0ba0, 0x11) => 10,
        (0x0ce6 | 0x0df2, 0x01) => 5,
        (0x0ce6 | 0x0df2, 0x31) => 6,
        _ => return None,
    };
    Some((*data.get(offset)?, *data.get(offset + 1)?))
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{left_stick, right_stick_y, menu_buttons, triggers, is_supported_controller_vendor, xinput_axis, xinput_price_buttons, MenuLatch, TriggerLatch, TriggerAction, XboxPriceTrigger};
    use std::{
        collections::HashMap,
        mem,
        time::{Duration, Instant},
        sync::{
            atomic::{AtomicBool, Ordering},
            Mutex, OnceLock,
        },
    };
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::{
        Foundation::*,
        UI::{Input::*, Input::XboxController::*, WindowsAndMessaging::*},
    };

    static ENABLED: AtomicBool = AtomicBool::new(false);
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static LATCHES: OnceLock<Mutex<HashMap<isize, TriggerLatch>>> = OnceLock::new();
    static MENU_LATCHES: OnceLock<Mutex<HashMap<isize, MenuLatch>>> = OnceLock::new();
    static STICK_SENT: OnceLock<Mutex<HashMap<isize, (Instant, bool, bool)>>> = OnceLock::new();

    #[cfg(test)]
    #[test]
    fn removing_a_controller_cancels_its_pending_long_hold_without_affecting_others() {
        const REMOVED: isize = 101;
        const REMAINING: isize = 102;
        let mut held = TriggerLatch::default();
        held.update(true, 0, 0, 0);
        held.update(true, 255, 255, 100);
        let latches = LATCHES.get_or_init(Default::default);
        {
            let mut latches = latches.lock().unwrap();
            latches.insert(REMOVED, held);
            latches.insert(REMAINING, TriggerLatch::default());
        }
        MENU_LATCHES.get_or_init(Default::default).lock().unwrap().insert(REMOVED, MenuLatch::default());
        STICK_SENT.get_or_init(Default::default).lock().unwrap().insert(REMOVED, (Instant::now(), false, false));

        unsafe { wndproc(0, WM_INPUT_DEVICE_CHANGE, GIDC_REMOVAL as WPARAM, REMOVED); }

        let mut latches = latches.lock().unwrap();
        assert!(latches.get_mut(&REMOVED).is_none(), "a disconnected controller must not fire its pending hold");
        assert!(latches.contains_key(&REMAINING), "other controllers must remain armed");
        latches.remove(&REMAINING);
        assert!(!MENU_LATCHES.get().unwrap().lock().unwrap().contains_key(&REMOVED));
        assert!(!STICK_SENT.get().unwrap().lock().unwrap().contains_key(&REMOVED));
    }
    fn millis() -> u64 { static START: OnceLock<Instant> = OnceLock::new(); START.get_or_init(Instant::now).elapsed().as_millis() as u64 }
    fn emit_trigger(action: Option<TriggerAction>) {
        if let (Some(app), Some(action)) = (APP.get(), action) {
            let _ = app.emit(match action { TriggerAction::PriceCheck => "controller-price-check", TriggerAction::Menu => "controller-open-menu" }, ());
        }
    }

    pub fn set_controller_price_check_enabled(enabled: bool) {
        ENABLED.store(enabled, Ordering::Relaxed);
        if let Some(latches) = LATCHES.get() {
            if let Ok(mut l) = latches.lock() {
                l.clear();
            }
        }
        if let Some(latches) = MENU_LATCHES.get() {
            if let Ok(mut l) = latches.lock() { l.clear(); }
        }
    }

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        if msg == WM_INPUT_DEVICE_CHANGE && wp as u32 == GIDC_REMOVAL {
            if let Some(latches) = LATCHES.get() {
                if let Ok(mut latches) = latches.lock() { latches.remove(&lp); }
            }
            if let Some(latches) = MENU_LATCHES.get() {
                if let Ok(mut latches) = latches.lock() { latches.remove(&lp); }
            }
            if let Some(sent) = STICK_SENT.get() {
                if let Ok(mut sent) = sent.lock() { sent.remove(&lp); }
            }
            return 0;
        }
        if msg == WM_INPUT && ENABLED.load(Ordering::Relaxed) {
            let header_size = mem::size_of::<RAWINPUTHEADER>() as u32;
            let mut size = 0;
            if GetRawInputData(lp, RID_INPUT, std::ptr::null_mut(), &mut size, header_size) == 0
                && size >= header_size + 8
                && size <= 65536
            {
                // u64 backing storage gives RAWINPUT the alignment required by Windows.
                let mut storage = vec![0u64; (size as usize + 7) / 8];
                if GetRawInputData(
                    lp,
                    RID_INPUT,
                    storage.as_mut_ptr().cast(),
                    &mut size,
                    header_size,
                ) == size
                {
                    let bytes =
                        std::slice::from_raw_parts(storage.as_ptr().cast::<u8>(), size as usize);
                    let header = &*(storage.as_ptr().cast::<RAWINPUTHEADER>());
                    if header.dwType == RIM_TYPEHID {
                        let mut info: RID_DEVICE_INFO = mem::zeroed();
                        info.cbSize = mem::size_of::<RID_DEVICE_INFO>() as u32;
                        let mut info_size = info.cbSize;
                        if GetRawInputDeviceInfoW(
                            header.hDevice,
                            RIDI_DEVICEINFO,
                            (&mut info as *mut RID_DEVICE_INFO).cast(),
                            &mut info_size,
                        ) != u32::MAX
                            && info.dwType == RIM_TYPEHID
                        {
                            let hid = info.Anonymous.hid;
                            if is_supported_controller_vendor(hid.dwVendorId) {
                                let start = header_size as usize + 8;
                                let report_size = u32::from_ne_bytes(
                                    bytes[header_size as usize..header_size as usize + 4]
                                        .try_into()
                                        .unwrap(),
                                ) as usize;
                                if report_size > 0 && start + report_size <= bytes.len() {
                                    let owns_focus = crate::modules::window::is_game_context()
                                        && crate::modules::window::foreground() == crate::modules::window::Foreground::OwnWindow;
                                    if owns_focus {
                                        if let (Some((x, y)), Some(scroll_y)) = (left_stick(hid.dwProductId, &bytes[start..start + report_size]), right_stick_y(hid.dwProductId, &bytes[start..start + report_size])) {
                                            let neutral = (i16::from(x) - 128).abs() < 23 && (i16::from(y) - 128).abs() < 23;
                                            let scroll_neutral = (i16::from(scroll_y) - 128).abs() < 23;
                                            if let Ok(mut sent) = STICK_SENT.get_or_init(Default::default).lock() {
                                                let now = Instant::now();
                                                let send = sent.get(&header.hDevice).map_or(true, |(last, was_neutral, was_scroll_neutral)| {
                                                    neutral != *was_neutral || scroll_neutral != *was_scroll_neutral || now.duration_since(*last) >= Duration::from_millis(33)
                                                });
                                                if send {
                                                    sent.insert(header.hDevice, (now, neutral, scroll_neutral));
                                                    if let Some(app) = APP.get() { let _ = app.emit("controller-stick", (x, y, scroll_y)); }
                                                }
                                            }
                                        }
                                    }
                                    if let Some(buttons) = menu_buttons(hid.dwProductId, &bytes[start..start + report_size]) {
                                        if let Ok(mut latches) = MENU_LATCHES.get_or_init(Default::default).lock() {
                                            let actions = latches.entry(header.hDevice).or_default().update(buttons, owns_focus);
                                            if owns_focus {
                                                if let Some(app) = APP.get() {
                                                    for action in actions { let _ = app.emit("controller-menu-action", action); }
                                                }
                                            }
                                        }
                                    }
                                    if let Some((left, right)) = triggers(
                                        hid.dwProductId,
                                        &bytes[start..start + report_size],
                                    ) {
                                        let active = crate::modules::window::is_game_context();
                                        if let Ok(mut latches) =
                                            LATCHES.get_or_init(Default::default).lock()
                                        {
                                            let action = latches
                                                .entry(header.hDevice)
                                                .or_default()
                                                .update(active, left, right, millis());
                                            emit_trigger(action);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        DefWindowProcW(hwnd, msg, wp, lp)
    }

    pub fn start(app: AppHandle) {
        let _ = APP.set(app);
        start_xinput();
        std::thread::spawn(|| loop {
            if ENABLED.load(Ordering::Relaxed) {
                let active = crate::modules::window::is_game_context();
                if let Some(latches) = LATCHES.get() {
                    if let Ok(mut latches) = latches.lock() {
                        for latch in latches.values_mut() { emit_trigger(latch.tick(active, millis())); }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        });
        std::thread::spawn(|| unsafe {
            let name: Vec<u16> = "PD2TraderControllerInput\0".encode_utf16().collect();
            let mut class: WNDCLASSW = mem::zeroed();
            class.lpfnWndProc = Some(wndproc);
            class.lpszClassName = name.as_ptr();
            if RegisterClassW(&class) == 0 {
                return;
            }
            let hwnd = CreateWindowExW(
                0,
                name.as_ptr(),
                name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                0,
                0,
                std::ptr::null(),
            );
            if hwnd == 0 {
                return;
            }
            let devices = [4u16, 5].map(|usage| RAWINPUTDEVICE {
                usUsagePage: 1,
                usUsage: usage,
                dwFlags: RIDEV_INPUTSINK | RIDEV_DEVNOTIFY,
                hwndTarget: hwnd,
            });
            if RegisterRawInputDevices(
                devices.as_ptr(),
                devices.len() as u32,
                mem::size_of::<RAWINPUTDEVICE>() as u32,
            ) == 0
            {
                return;
            }
            let mut message: MSG = mem::zeroed();
            while GetMessageW(&mut message, 0, 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        });
    }

    fn start_xinput() {
        std::thread::spawn(|| {
            let mut triggers: [XboxPriceTrigger; 4] = std::array::from_fn(|_| XboxPriceTrigger::default());
            let mut menus: [MenuLatch; 4] = std::array::from_fn(|_| MenuLatch::default());
            let mut connected = [false; 4];
            let mut next_probe = [Instant::now(); 4];
            let mut last_stick = [Instant::now(); 4];
            let mut stick_active = [false; 4];
            loop {
                if !ENABLED.load(Ordering::Relaxed) {
                    triggers = std::array::from_fn(|_| XboxPriceTrigger::default());
                    menus = std::array::from_fn(|_| MenuLatch::default());
                    stick_active = [false; 4];
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                let active = crate::modules::window::is_game_context();
                let owns_focus = active && crate::modules::window::foreground() == crate::modules::window::Foreground::OwnWindow;
                for index in 0..4 {
                    let now = Instant::now();
                    if !connected[index] && now < next_probe[index] { continue; }
                    let mut state: XINPUT_STATE = unsafe { mem::zeroed() };
                    if unsafe { XInputGetState(index as u32, &mut state) } != ERROR_SUCCESS {
                        connected[index] = false;
                        next_probe[index] = now + Duration::from_secs(1);
                        triggers[index] = XboxPriceTrigger::default();
                        menus[index] = MenuLatch::default();
                        stick_active[index] = false;
                        continue;
                    }
                    connected[index] = true;
                    let pad = state.Gamepad;
                    if triggers[index].update(active, pad.bLeftTrigger, pad.bRightTrigger) {
                        if let Some(app) = APP.get() { let _ = app.emit("controller-price-check", ()); }
                    }
                    let actions = menus[index].update(xinput_price_buttons(pad.wButtons), owns_focus);
                    if owns_focus {
                        if let Some(app) = APP.get() {
                            for action in actions { let _ = app.emit("controller-xbox-price-action", action); }
                        }
                        let x = xinput_axis(pad.sThumbLX, false);
                        let y = xinput_axis(pad.sThumbLY, true);
                        let scroll_y = xinput_axis(pad.sThumbRY, true);
                        let moving = (i16::from(x) - 128).abs() >= 23 || (i16::from(y) - 128).abs() >= 23 || (i16::from(scroll_y) - 128).abs() >= 23;
                        if moving != stick_active[index] || (moving && now.duration_since(last_stick[index]) >= Duration::from_millis(33)) {
                            if let Some(app) = APP.get() { let _ = app.emit("controller-xbox-price-stick", (x, y, scroll_y)); }
                            last_stick[index] = now;
                        }
                        stick_active[index] = moving;
                    } else {
                        stick_active[index] = false;
                    }
                }
                std::thread::sleep(Duration::from_millis(16));
            }
        });
    }
}

#[cfg(target_os = "windows")]
pub use windows::start;

#[tauri::command]
pub fn set_controller_price_check_enabled(enabled: bool) {
    #[cfg(target_os = "windows")]
    windows::set_controller_price_check_enabled(enabled);
    #[cfg(not(target_os = "windows"))]
    let _ = enabled;
}
