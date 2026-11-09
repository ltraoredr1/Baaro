#include <stdint.h>

/* Le wrapper JS copie au plus 64 octets dans cette zone WASM fixe. */
static uint8_t input_bytes[64];

enum {
  STORY_MEDIA_UNKNOWN = 0,
  STORY_MEDIA_JPEG = 1,
  STORY_MEDIA_PNG = 2,
  STORY_MEDIA_GIF = 3,
  STORY_MEDIA_WEBP = 4,
  STORY_MEDIA_MP4 = 5,
  STORY_MEDIA_WEBM = 6,
  STORY_MEDIA_AVIF = 7
};

static int has_brand(uint32_t length, uint32_t offset, const char *brand) {
  return length >= offset + 4 && input_bytes[offset] == (uint8_t)brand[0] &&
         input_bytes[offset + 1] == (uint8_t)brand[1] &&
         input_bytes[offset + 2] == (uint8_t)brand[2] &&
         input_bytes[offset + 3] == (uint8_t)brand[3];
}

static int is_video_brand(uint32_t length, uint32_t offset) {
  static const char *brands[] = {
    "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42",
    "M4V ", "qt  ", "3gp4", "3gp5", "3g2a", "avc1", "MSNV", "dash"
  };
  for (uint32_t i = 0; i < sizeof(brands) / sizeof(brands[0]); i++) {
    if (has_brand(length, offset, brands[i])) return 1;
  }
  return 0;
}

uint32_t story_input_buffer(void) {
  return (uint32_t)(uintptr_t)input_bytes;
}

uint32_t story_detect_media(uint32_t length) {
  const uint8_t *b = input_bytes;
  if (length >= 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff) return STORY_MEDIA_JPEG;
  if (length >= 8 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' &&
      b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return STORY_MEDIA_PNG;
  if (length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8' &&
      (b[4] == '7' || b[4] == '9') && b[5] == 'a') return STORY_MEDIA_GIF;
  if (length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' &&
      b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return STORY_MEDIA_WEBP;

  if (length >= 12 && has_brand(length, 4, "ftyp")) {
    if (has_brand(length, 8, "avif") || has_brand(length, 8, "avis") ||
        has_brand(length, 16, "avif") || has_brand(length, 16, "avis")) return STORY_MEDIA_AVIF;
    /* HEIC/HEIF n'est pas un format de rendu garanti par les navigateurs. */
    if (has_brand(length, 8, "heic") || has_brand(length, 8, "heix") ||
        has_brand(length, 8, "hevc") || has_brand(length, 8, "mif1") ||
        has_brand(length, 8, "msf1")) return STORY_MEDIA_UNKNOWN;
    if (is_video_brand(length, 8) || is_video_brand(length, 16) ||
        is_video_brand(length, 20) || is_video_brand(length, 24)) return STORY_MEDIA_MP4;
    return STORY_MEDIA_UNKNOWN;
  }
  if (length >= 4 && b[0] == 0x1a && b[1] == 0x45 && b[2] == 0xdf && b[3] == 0xa3) return STORY_MEDIA_WEBM;
  return STORY_MEDIA_UNKNOWN;
}
