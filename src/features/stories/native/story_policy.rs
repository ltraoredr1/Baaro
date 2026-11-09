#![no_std]

//! Règles locales rapides pour le compositeur Stories.
//! Ceci améliore l'UX uniquement : les mêmes limites doivent être imposées côté serveur.

const MAX_MEDIA_COUNT: u32 = 10;
const MAX_FILE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_SCHEDULE_MS: i64 = 30 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_MS: i64 = 60 * 1000;

/// Retourne 0 si valide, sinon un code stable consommé par le wrapper JS.
/// Code 1 = trop de fichiers, 2 = taille dépassée, 3 = date invalide.
#[no_mangle]
pub extern "C" fn story_validate(
    file_count: u32,
    max_file_bytes: u64,
    publish_delay_ms: i64,
) -> u32 {
    if file_count > MAX_MEDIA_COUNT {
        return 1;
    }
    if max_file_bytes > MAX_FILE_BYTES {
        return 2;
    }
    if publish_delay_ms != 0
        && (publish_delay_ms < MIN_SCHEDULE_MS || publish_delay_ms > MAX_SCHEDULE_MS)
    {
        return 3;
    }
    0
}

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod tests {
    use super::story_validate;
    use std::assert_eq;

    #[test]
    fn accepts_text_and_boundary_values() {
        assert_eq!(story_validate(0, 0, 0), 0);
        assert_eq!(
            story_validate(10, 100 * 1024 * 1024, 30 * 24 * 60 * 60 * 1000),
            0
        );
    }

    #[test]
    fn rejects_invalid_count_size_and_schedule() {
        assert_eq!(story_validate(11, 0, 0), 1);
        assert_eq!(story_validate(1, 100 * 1024 * 1024 + 1, 0), 2);
        assert_eq!(story_validate(1, 0, 59_999), 3);
        assert_eq!(story_validate(1, 0, 30 * 24 * 60 * 60 * 1000 + 1), 3);
    }
}
