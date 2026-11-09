import {
  MAX_MEDIA_ITEMS,
  MAX_SCHEDULE_DAYS,
  MAX_UPLOAD_BYTES,
} from '../constants.js';

const CODE_MESSAGES = {
  1: `Sélectionne au maximum ${MAX_MEDIA_ITEMS} médias`,
  2: `Chaque média doit faire au maximum ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo`,
  3: `Choisis une programmation entre 1 minute et ${MAX_SCHEDULE_DAYS} jours`,
};

const MIME_TO_CODE = new Map([
  ['image/jpeg', 1], ['image/jpg', 1],
  ['image/png', 2],
  ['image/gif', 3],
  ['image/webp', 4],
  ['video/mp4', 5], ['video/quicktime', 5], ['video/x-m4v', 5],
  ['video/webm', 6],
  ['image/avif', 7],
]);

const CODE_TO_KIND = new Map([
  [1, { mediaType: 'image', mime: 'image/jpeg' }],
  [2, { mediaType: 'image', mime: 'image/png' }],
  [3, { mediaType: 'image', mime: 'image/gif' }],
  [4, { mediaType: 'image', mime: 'image/webp' }],
  [5, { mediaType: 'video', mime: 'video/mp4' }],
  [6, { mediaType: 'video', mime: 'video/webm' }],
  [7, { mediaType: 'image', mime: 'image/avif' }],
]);

let wasmLoadPromise;
function loadValidators() {
  if (!wasmLoadPromise) {
    wasmLoadPromise = (async () => {
      if (typeof WebAssembly === 'undefined' || typeof fetch !== 'function') return null;
      try {
        const base = import.meta.env?.BASE_URL || '/';
        const root = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const [policyResponse, mediaResponse] = await Promise.all([
          fetch(new URL(`${base}wasm/stories_policy.wasm`, root)),
          fetch(new URL(`${base}wasm/stories_media.wasm`, root)),
        ]);
        if (!policyResponse.ok || !mediaResponse.ok) return null;
        const [policyBytes, mediaBytes] = await Promise.all([
          policyResponse.arrayBuffer(), mediaResponse.arrayBuffer(),
        ]);
        const [policy, media] = await Promise.all([
          WebAssembly.instantiate(policyBytes, {}),
          WebAssembly.instantiate(mediaBytes, {}),
        ]);
        if (!policy.instance.exports.story_validate || !media.instance.exports.story_detect_media ||
            !media.instance.exports.story_input_buffer || !media.instance.exports.memory) return null;
        return { policy: policy.instance.exports, media: media.instance.exports };
      } catch {
        // Fonctionnement dégradé sans WASM : l'application reste utilisable.
        return null;
      }
    })();
  }
  return wasmLoadPromise;
}

export function validateStoryMetadataJs({ fileCount, maxFileBytes, publishDelayMs }) {
  if (fileCount > MAX_MEDIA_ITEMS) return 1;
  if (maxFileBytes > MAX_UPLOAD_BYTES) return 2;
  if (publishDelayMs !== 0 &&
      (publishDelayMs < 60_000 || publishDelayMs > MAX_SCHEDULE_DAYS * 86_400_000)) return 3;
  return 0;
}

export function detectMediaCodeJs(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ascii = (start, text) => [...text].every((char, i) => b[start + i] === char.charCodeAt(0));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 1;
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 2;
  if (b.length >= 6 && ascii(0, 'GIF8') && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 3;
  if (b.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 4;
  if (b.length >= 12 && ascii(4, 'ftyp')) {
    if (ascii(8, 'avif') || ascii(8, 'avis') ||
        (b.length >= 20 && (ascii(16, 'avif') || ascii(16, 'avis')))) return 7;
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].some((brand) => ascii(8, brand))) return 0;
    const videoBrands = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'M4V ', 'qt  ', '3gp4', '3gp5', '3g2a', 'avc1', 'MSNV', 'dash'];
    for (const offset of [8, 16, 20, 24]) {
      if (videoBrands.some((brand) => b.length >= offset + 4 && ascii(offset, brand))) return 5;
    }
    return 0;
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 6;
  return 0;
}

function detectMediaCodeWasm(exports, bytes) {
  const len = Math.min(bytes.length, 64);
  const ptr = exports.story_input_buffer();
  new Uint8Array(exports.memory.buffer, ptr, len).set(bytes.subarray(0, len));
  return exports.story_detect_media(len);
}

function assertMetadata(code) {
  if (code !== 0) throw new Error(CODE_MESSAGES[code] || 'Métadonnées de story invalides');
}

/** Valide les limites via Rust WASM (ou fallback JS), puis inspecte les signatures C/JS. */
export async function validateStoryFiles(files, publishAt = '') {
  const list = Array.from(files || []);
  const publishDelayMs = publishAt ? new Date(publishAt).getTime() - Date.now() : 0;
  if (publishAt && !Number.isFinite(publishDelayMs)) {
    throw new Error('Date de programmation invalide');
  }
  const maxFileBytes = list.reduce((max, file) => Math.max(max, Number(file?.size) || 0), 0);
  const wasm = await loadValidators();
  const code = wasm
    ? wasm.policy.story_validate(list.length, BigInt(maxFileBytes), BigInt(Math.trunc(publishDelayMs)))
    : validateStoryMetadataJs({ fileCount: list.length, maxFileBytes, publishDelayMs: Math.trunc(publishDelayMs) });
  assertMetadata(code);

  const detected = [];
  for (const file of list) {
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const mediaCode = wasm ? detectMediaCodeWasm(wasm.media, bytes) : detectMediaCodeJs(bytes);
    const kind = CODE_TO_KIND.get(mediaCode);
    if (!kind) {
      throw new Error(`Format média non pris en charge ou fichier invalide : ${file.name || 'fichier'}`);
    }
    const declared = MIME_TO_CODE.get(String(file.type || '').toLowerCase());
    if (declared && declared !== mediaCode) {
      throw new Error(`Le contenu réel de « ${file.name || 'fichier'} » ne correspond pas à son type déclaré.`);
    }
    detected.push(kind);
  }
  return detected;
}
