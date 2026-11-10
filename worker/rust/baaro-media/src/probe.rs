use std::ffi::CString;
use std::os::raw::{c_char, c_int};

#[repr(C)]
#[derive(Default)]
struct RawProbeInfo {
    has_video: c_int,
    has_audio: c_int,
    width: c_int,
    height: c_int,
    duration_ms: i64,
}

unsafe extern "C" {
    fn baaro_probe_media(path: *const c_char, out: *mut RawProbeInfo) -> c_int;
    fn baaro_libavformat_version() -> u32;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ProbeInfo {
    pub has_video: bool,
    pub has_audio: bool,
    pub width: i32,
    pub height: i32,
    pub duration_ms: i64,
}

/// Valide un fichier média local allowlisté par libavformat via le shim C.
pub fn validate(path: &str) -> Result<ProbeInfo, i32> {
    let c_path = CString::new(path).map_err(|_| 1)?;
    let mut raw = RawProbeInfo::default();

    // SAFETY: `c_path` est NUL-terminée et reste vivante pendant l’appel ;
    // `raw` pointe vers une structure writable au layout #[repr(C)] identique.
    let status = unsafe { baaro_probe_media(c_path.as_ptr(), &mut raw) };
    if status != 0 {
        return Err(status);
    }

    Ok(ProbeInfo {
        has_video: raw.has_video != 0,
        has_audio: raw.has_audio != 0,
        width: raw.width.max(0),
        height: raw.height.max(0),
        duration_ms: raw.duration_ms.max(0),
    })
}

pub fn libavformat_version() -> String {
    // SAFETY: la fonction C ne prend aucun pointeur et retourne un entier ABI-safe.
    let version = unsafe { baaro_libavformat_version() };
    format!(
        "{}.{}.{}",
        version >> 16,
        (version >> 8) & 0xff,
        version & 0xff
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ffi_types_are_stable_and_default_to_invalid() {
        let raw = RawProbeInfo::default();
        assert_eq!(raw.has_video, 0);
        assert_eq!(raw.has_audio, 0);
        assert_eq!(raw.duration_ms, 0);
        assert_eq!(
            ProbeInfo::default(),
            ProbeInfo {
                has_video: false,
                has_audio: false,
                width: 0,
                height: 0,
                duration_ms: 0,
            }
        );
    }

    #[test]
    fn linked_libavformat_has_a_valid_version() {
        assert!(libavformat_version().split('.').count() == 3);
    }
}
