import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { retryDelayMs, validateOfflineRecord } from "../src/features/offline/offlineCore.js";
import { isTransientOfflineError } from "../src/lib/offlineErrorPolicy.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
globalThis.fetch = async (url) => {
  const relative = String(url).replace(/^\//, "");
  try {
    return new Response(await readFile(resolve(root, "public", relative)), { status: 200 });
  } catch {
    return new Response("not found", { status: 404 });
  }
};
const readModule = async (name) => {
  const bytes = await readFile(resolve(root, "public/wasm", name));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
};

const rust = await readModule("offline_core.wasm");
assert.equal(rust.offline_validate_action(1, 0, 64), 1, "like action accepted");
assert.equal(rust.offline_validate_action(4, 0, 64), 1, "unfollow action accepted");
assert.equal(rust.offline_validate_action(99, 0, 64), 0, "unknown action rejected");
assert.equal(rust.offline_validate_action(1, 5, 64), 0, "retry limit enforced");
assert.equal(rust.offline_validate_action(1, 0, 4097), 0, "payload limit enforced");
assert.equal(rust.offline_retry_delay_ms(0), 1000);
assert.equal(rust.offline_retry_delay_ms(3), 8000);
assert.equal(rust.offline_retry_delay_ms(99), 256000);

const c = await readModule("offline_payload.wasm");
const pointer = c.offline_payload_buffer() >>> 0;
const buffer = new Uint8Array(c.memory.buffer);
const good = new TextEncoder().encode('{"message":"salut é"}');
buffer.set(good, pointer);
assert.equal(c.offline_validate_payload(good.length), 1, "valid UTF-8 accepted");
buffer[pointer] = 0xff;
assert.equal(c.offline_validate_payload(1), 0, "invalid UTF-8 rejected");
assert.equal(c.offline_validate_payload(4097), 0, "oversized payload rejected");
assert.equal(await validateOfflineRecord("unfollow_user", 0, { followed_id: "123" }), true);
assert.equal(await validateOfflineRecord("not_an_action", 0, {}), false);
assert.equal(await validateOfflineRecord("like_post", 5, {}), false);
assert.equal(await validateOfflineRecord("like_post", 0, { value: "x".repeat(5000) }), false);
assert.equal(await retryDelayMs(3), 8000);
assert.equal(isTransientOfflineError(new TypeError("Failed to fetch")), true);
assert.equal(isTransientOfflineError({ status: 503 }), true);
assert.equal(isTransientOfflineError({ status: 429 }), true);
assert.equal(isTransientOfflineError({ message: "SOCIAL_RATE_LIMIT" }), false);
assert.equal(isTransientOfflineError({ status: 401, message: "network unavailable" }), false);
assert.equal(isTransientOfflineError({ status: 400, message: "invalid payload" }), false);
assert.equal(isTransientOfflineError(new Error("constraint violation")), false);
console.log("offline Rust/C WASM tests: OK");
