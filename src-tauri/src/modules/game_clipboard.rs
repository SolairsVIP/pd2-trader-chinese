/// PD2 writes UTF-8 JSON into CF_TEXT. Windows' synthesized CF_UNICODETEXT
/// decodes it as ANSI, corrupting Chinese and sometimes even JSON delimiters.
/// Only accept complete item JSON; ordinary clipboard reads keep their old path.
pub fn read_utf8_item() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let bytes = windows::read_cf_text()?;
        return decode_item_bytes(&bytes);
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

// TBL colours use a legacy single-byte 0xff before 'c' and a colour selector.
// Convert only this exact marker to UTF-8; reject every other invalid byte.
// JSON structure, numeric fields and unknown bytes are never guessed/repaired.
#[cfg(any(target_os = "windows", test))]
fn decode_item_bytes(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == 0)?;
    let mut utf8 = Vec::with_capacity(end);
    let mut i = 0;
    while i < end {
        if bytes[i] == 0xff
            && i + 2 < end
            && bytes[i + 1] == b'c'
            && bytes[i + 2].is_ascii_graphic()
        {
            utf8.extend_from_slice("ÿ".as_bytes());
        } else {
            utf8.push(bytes[i]);
        }
        i += 1;
    }
    let text = std::str::from_utf8(&utf8)
        .ok()?
        .trim_start_matches('\u{feff}');
    let item: serde_json::Value = serde_json::from_str(text).ok()?;
    if item.get("quality")?.is_string()
        && item.get("type")?.is_string()
        && item.get("iLevel")?.is_number()
    {
        Some(text.to_owned())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::decode_item_bytes;

    #[test]
    fn preserves_complete_utf8_item_and_bom() {
        let item =
            r#"{"iLevel":85,"type":"精良箭矢 Sharp Arrows","quality":"Unique","name":"Tombsong"}"#;
        assert_eq!(
            decode_item_bytes(format!("\u{feff}{item}\0").as_bytes()).as_deref(),
            Some(item)
        );
    }

    #[test]
    fn accepts_legacy_colour_markers_in_utf8_strings() {
        let mut bytes =
            br#"{"iLevel":85,"type":"Sharp Arrows","quality":"Unique","name":""#.to_vec();
        bytes.extend_from_slice(b"\xffc4Tombsong\xffc/");
        bytes.extend_from_slice(b"\"}\0");
        let decoded = decode_item_bytes(&bytes).unwrap();
        let item: serde_json::Value = serde_json::from_str(&decoded).unwrap();
        assert_eq!(item["name"], "ÿc4Tombsongÿc/");
    }

    #[test]
    fn rejects_bad_bytes_broken_json_and_non_items() {
        for bytes in [
            b"{\"iLevel\":85,\"type\":\"\xffx1\",\"quality\":\"Unique\"}\0".as_slice(),
            b"{\"iLevel\":85,\"type\":\"Sharp Arrows?,\"quality\":\"Unique\"}\0",
            b"{\"type\":\"Sharp Arrows\"}\0",
            b"{\"iLevel\":85,\"type\":\"Sharp Arrows\",\"quality\":\"Unique\"}",
        ] {
            assert!(decode_item_bytes(bytes).is_none());
        }
    }
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
