/// PD2 writes UTF-8 JSON into CF_TEXT. Windows' synthesized CF_UNICODETEXT
/// decodes it as ANSI, corrupting Chinese and sometimes even JSON delimiters.
/// Only accept complete item JSON; ordinary clipboard reads keep their old path.
pub fn read_utf8_item() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let bytes = windows::read_cf_text()?;
        let end = bytes.iter().position(|byte| *byte == 0)?;
        let text = std::str::from_utf8(&bytes[..end])
            .ok()?
            .trim_start_matches('\u{feff}');
        let item: serde_json::Value = serde_json::from_str(text).ok()?;
        if item.get("quality")?.is_string()
            && item.get("type")?.is_string()
            && item.get("iLevel")?.is_number()
        {
            return Some(text.to_owned());
        }
    }
    None
}

#[cfg(target_os = "windows")]
mod windows {
    use windows_sys::Win32::{
        Foundation::HGLOBAL,
        System::{
            DataExchange::{CloseClipboard, EnumClipboardFormats, GetClipboardData, OpenClipboard},
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
    };

    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    struct MemoryGuard(HGLOBAL);
    impl Drop for MemoryGuard {
        fn drop(&mut self) {
            unsafe {
                GlobalUnlock(self.0);
            }
        }
    }

    pub fn read_cf_text() -> Option<Vec<u8>> {
        const CF_TEXT: u32 = 1;
        const MAX_BYTES: usize = 1024 * 1024;
        // Copy while the clipboard is locked, then release it before decoding
        // or parsing. No polling, writes or clipboard ownership changes here.
        unsafe {
            if OpenClipboard(0) == 0 {
                return None;
            }
            let _clipboard = ClipboardGuard;
            // A real Unicode clipboard (e.g. text copied from an editor) must
            // not be replaced by its potentially lossy synthesized ANSI form.
            let mut format = EnumClipboardFormats(0);
            while format != CF_TEXT {
                if format == 0 || format == 13 {
                    return None;
                }
                format = EnumClipboardFormats(format);
            }
            let handle = GetClipboardData(CF_TEXT);
            if handle == 0 {
                return None;
            }
            let size = GlobalSize(handle);
            if size == 0 || size > MAX_BYTES {
                return None;
            }
            let ptr = GlobalLock(handle);
            if ptr.is_null() {
                return None;
            }
            let _memory = MemoryGuard(handle);
            Some(std::slice::from_raw_parts(ptr.cast::<u8>(), size).to_vec())
        }
    }
}
