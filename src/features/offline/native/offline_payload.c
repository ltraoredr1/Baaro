#include <stdint.h>

#define MAX_PAYLOAD_BYTES 4096u

static uint8_t payload_buffer[MAX_PAYLOAD_BYTES + 1u];

__attribute__((visibility("default")))
uint32_t offline_payload_buffer(void) {
  return (uint32_t)(uintptr_t)payload_buffer;
}

/* Rejette UTF-8 mal formé, séquences surlongues, surrogate halves et > U+10FFFF. */
__attribute__((visibility("default")))
uint32_t offline_validate_payload(uint32_t length) {
  if (length > MAX_PAYLOAD_BYTES) return 0u;
  uint32_t i = 0u;
  while (i < length) {
    uint8_t a = payload_buffer[i++];
    if (a <= 0x7fu) continue;
    if (a >= 0xc2u && a <= 0xdfu) {
      if (i >= length || (payload_buffer[i++] & 0xc0u) != 0x80u) return 0u;
      continue;
    }
    if (a >= 0xe0u && a <= 0xefu) {
      if (i + 1u >= length) return 0u;
      uint8_t b = payload_buffer[i++];
      uint8_t c = payload_buffer[i++];
      if ((b & 0xc0u) != 0x80u || (c & 0xc0u) != 0x80u) return 0u;
      if ((a == 0xe0u && b < 0xa0u) || (a == 0xedu && b >= 0xa0u)) return 0u;
      continue;
    }
    if (a >= 0xf0u && a <= 0xf4u) {
      if (i + 2u >= length) return 0u;
      uint8_t b = payload_buffer[i++];
      uint8_t c = payload_buffer[i++];
      uint8_t d = payload_buffer[i++];
      if ((b & 0xc0u) != 0x80u || (c & 0xc0u) != 0x80u || (d & 0xc0u) != 0x80u) return 0u;
      if ((a == 0xf0u && b < 0x90u) || (a == 0xf4u && b >= 0x90u)) return 0u;
      continue;
    }
    return 0u;
  }
  return 1u;
}
