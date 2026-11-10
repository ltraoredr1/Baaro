#![no_std]

#[cfg(not(test))]
use core::panic::PanicInfo;

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

const MAX_ATTEMPTS: u32 = 5;
const MAX_PAYLOAD_BYTES: u32 = 4096;

/// Codes stables partagés avec offlineCore.js : like=1, unlike=2, follow=3, unfollow=4.
#[no_mangle]
pub extern "C" fn offline_validate_action(
    action: u32,
    attempts: u32,
    payload_bytes: u32,
) -> u32 {
    let known_action = (1..=4).contains(&action);
    (known_action && attempts < MAX_ATTEMPTS && payload_bytes <= MAX_PAYLOAD_BYTES) as u32
}

/// Délai exponentiel, plafonné à cinq minutes.
#[no_mangle]
pub extern "C" fn offline_retry_delay_ms(attempts: u32) -> u32 {
    let exponent = attempts.min(8);
    let delay = 1_000u32.saturating_mul(1u32 << exponent);
    delay.min(300_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_actions_and_limits() {
        assert_eq!(offline_validate_action(1, 0, 32), 1);
        assert_eq!(offline_validate_action(9, 0, 32), 0);
        assert_eq!(offline_validate_action(1, 5, 32), 0);
        assert_eq!(offline_validate_action(1, 0, 4097), 0);
    }

    #[test]
    fn retry_is_bounded() {
        assert_eq!(offline_retry_delay_ms(0), 1_000);
        assert_eq!(offline_retry_delay_ms(3), 8_000);
        assert_eq!(offline_retry_delay_ms(20), 256_000);
    }
}
