import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wasmDir = resolve(root, 'public/wasm');
const policyBytes = await readFile(resolve(wasmDir, 'stories_policy.wasm'));
const mediaBytes = await readFile(resolve(wasmDir, 'stories_media.wasm'));
const [{ instance: policy }, { instance: media }] = await Promise.all([
  WebAssembly.instantiate(policyBytes), WebAssembly.instantiate(mediaBytes),
]);

const validate = policy.exports.story_validate;
assert.equal(typeof validate, 'function', 'export Rust story_validate');
assert.equal(validate(0, 0n, 0n), 0, 'story texte immédiate');
assert.equal(validate(10, 104857600n, 2592000000n), 0, 'limites inclusives');
assert.equal(validate(11, 0n, 0n), 1, 'trop de médias');
assert.equal(validate(1, 104857601n, 0n), 2, 'média trop volumineux');
assert.equal(validate(1, 0n, 59999n), 3, 'date trop proche');
assert.equal(validate(1, 0n, 2592000001n), 3, 'date trop éloignée');

const { memory, story_input_buffer: getInput, story_detect_media: sniff } = media.exports;
assert.ok(memory && typeof getInput === 'function' && typeof sniff === 'function', 'exports C disponibles');
function detects(bytes) {
  const data = Uint8Array.from(bytes);
  const ptr = getInput();
  new Uint8Array(memory.buffer, ptr, data.length).set(data);
  return sniff(data.length);
}
assert.equal(detects([0xff, 0xd8, 0xff, 0x00]), 1, 'JPEG');
assert.equal(detects([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 2, 'PNG');
assert.equal(detects([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 3, 'GIF');
assert.equal(detects([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 4, 'WebP');
assert.equal(detects([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]), 5, 'MP4');
assert.equal(detects([0x1a, 0x45, 0xdf, 0xa3]), 6, 'WebM');
assert.equal(detects([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]), 7, 'AVIF');
assert.equal(detects([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), 0, 'HEIC refusé');
assert.equal(detects([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x7a, 0x7a, 0x7a, 0x7a]), 0, 'ftyp inconnu refusé');
assert.equal(detects([0, 1, 2, 3, 4, 5]), 0, 'contenu inconnu rejeté');
console.log('OK : 17 vérifications d’exécution Rust/C WASM');
