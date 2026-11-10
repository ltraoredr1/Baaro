const ACTION_CODES = Object.freeze({ like_post: 1, unlike_post: 2, follow_user: 3, unfollow_user: 4 });
const MAX_ATTEMPTS = 5;
const MAX_PAYLOAD_BYTES = 4096;
let wasmPromise;

async function loadWasmPair() {
  if (typeof WebAssembly === "undefined" || typeof fetch !== "function") return null;
  try {
    const [rustResponse, cResponse] = await Promise.all([
      fetch("/wasm/offline_core.wasm"),
      fetch("/wasm/offline_payload.wasm"),
    ]);
    if (!rustResponse.ok || !cResponse.ok) return null;
    const [rustBytes, cBytes] = await Promise.all([
      rustResponse.arrayBuffer(),
      cResponse.arrayBuffer(),
    ]);
    const [rust, c] = await Promise.all([
      WebAssembly.instantiate(rustBytes, {}),
      WebAssembly.instantiate(cBytes, {}),
    ]);
    const rustExports = rust.instance.exports;
    const cExports = c.instance.exports;
    if (
      typeof rustExports.offline_validate_action !== "function" ||
      typeof rustExports.offline_retry_delay_ms !== "function" ||
      !cExports.memory ||
      typeof cExports.offline_payload_buffer !== "function" ||
      typeof cExports.offline_validate_payload !== "function"
    ) return null;
    return { rust: rustExports, c: cExports };
  } catch {
    return null;
  }
}

function wasm() {
  if (!wasmPromise) wasmPromise = loadWasmPair();
  return wasmPromise;
}

export async function validateOfflineRecord(type, attempts, payload) {
  const code = ACTION_CODES[type];
  if (!code || !Number.isInteger(attempts) || attempts < 0 || attempts >= MAX_ATTEMPTS) return false;
  let serialized;
  try {
    serialized = JSON.stringify(payload ?? {});
  } catch {
    return false;
  }
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) return false;

  const core = await wasm();
  if (!core) return true;
  try {
    const address = core.c.offline_payload_buffer() >>> 0;
    const memory = new Uint8Array(core.c.memory.buffer);
    if (address + bytes.byteLength > memory.byteLength) return false;
    memory.set(bytes, address);
    return core.rust.offline_validate_action(code, attempts, bytes.byteLength) === 1 &&
      core.c.offline_validate_payload(bytes.byteLength) === 1;
  } catch {
    return false;
  }
}

export async function retryDelayMs(attempts) {
  const safeAttempts = Math.max(0, Math.min(8, Number(attempts) || 0));
  const core = await wasm();
  if (core) {
    try {
      return core.rust.offline_retry_delay_ms(safeAttempts);
    } catch {
      // Repli JS déterministe ci-dessous.
    }
  }
  return Math.min(300_000, 1_000 * (2 ** safeAttempts));
}

export const OFFLINE_MAX_ATTEMPTS = MAX_ATTEMPTS;
