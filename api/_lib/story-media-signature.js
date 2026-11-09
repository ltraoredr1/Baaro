const ascii = (bytes, start, text) => [...text].every((char, i) => bytes[start + i] === char.charCodeAt(0));
const VIDEO_BRANDS = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'M4V ', 'qt  ', '3gp4', '3gp5', '3g2a', 'avc1', 'MSNV', 'dash'];

/** Détecte uniquement des conteneurs média inertes pris en charge par Stories. */
export function detectStoryMediaType(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && ascii(b, 0, 'GIF8') && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'image/webp';
  if (b.length >= 12 && ascii(b, 4, 'ftyp')) {
    if (ascii(b, 8, 'avif') || ascii(b, 8, 'avis') ||
        (b.length >= 20 && (ascii(b, 16, 'avif') || ascii(b, 16, 'avis')))) return 'image/avif';
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].some((brand) => ascii(b, 8, brand))) return null;
    if ([8, 16, 20, 24].some((offset) =>
      b.length >= offset + 4 && VIDEO_BRANDS.some((brand) => ascii(b, offset, brand)))) return 'video/mp4';
    return null;
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

export function isCompatibleStoryMime(detected, declared) {
  if (!detected) return false;
  const aliases = {
    'image/jpg': 'image/jpeg',
    'video/quicktime': 'video/mp4',
    'video/x-m4v': 'video/mp4',
  };
  const normalized = aliases[String(declared || '').toLowerCase()] || String(declared || '').toLowerCase();
  return normalized === detected || normalized === 'application/octet-stream';
}
