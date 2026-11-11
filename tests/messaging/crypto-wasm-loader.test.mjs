import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCryptoWasmApi,
  createCryptoWasmLoader,
  resolveCryptoWasmUrl,
} from "../../src/features/messaging/lib/crypto-wasm.js";

describe("messaging crypto WASM loader", () => {
  it("resolves the public artifact from the emitted asset chunk and Vite dev root", () => {
    assert.equal(
      resolveCryptoWasmUrl({
        isDev: false,
        sourceUrl: "https://app.example/subpath/assets/messaging-abc123.js",
      }),
      "https://app.example/subpath/wasm/messaging_crypto.js"
    );
    assert.equal(
      resolveCryptoWasmUrl({
        isDev: true,
        origin: "http://localhost:5173",
      }),
      "http://localhost:5173/wasm/messaging_crypto.js"
    );
  });

  it("shares concurrent initialization and invokes wasm-bindgen init once", async () => {
    let importCount = 0;
    let initCount = 0;
    const module = {
      default: async () => {
        initCount += 1;
      },
    };
    const load = createCryptoWasmLoader(async () => {
      importCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return module;
    });

    const first = load();
    const second = load();
    assert.strictEqual(first, second);
    assert.strictEqual(await first, module);
    assert.equal(importCount, 1);
    assert.equal(initCount, 1);
  });

  it("clears a rejected import so a later attempt can recover", async () => {
    let attempts = 0;
    const module = { default: async () => {} };
    const load = createCryptoWasmLoader(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary load failure");
      return module;
    });

    await assert.rejects(load(), /temporary load failure/);
    assert.strictEqual(await load(), module);
    assert.equal(attempts, 2);
  });

  it("routes the camelCase API to every versioned wasm-bindgen export", async () => {
    const calls = [];
    const module = {
      generate_identity_keypair: () => (calls.push(["generate"]), "identity"),
      encrypt_message_v3: (...args) => (calls.push(["encrypt", ...args]), "envelope"),
      decrypt_message_v3: (...args) => (calls.push(["decrypt", ...args]), "plaintext"),
      compute_safety_number: (...args) => (calls.push(["safety", ...args]), "fingerprint"),
      constant_time_equal: (...args) => (calls.push(["equal", ...args]), true),
    };
    const api = createCryptoWasmApi(async () => module);
    const plaintext = new Uint8Array([1, 2]);
    const publicKey = new Uint8Array([3, 4]);
    const envelope = new Uint8Array([5, 6]);
    const privateKey = new Uint8Array([7, 8]);

    assert.equal(await api.generateIdentityKeyPairV3(), "identity");
    assert.equal(await api.encryptMessageV3(plaintext, publicKey), "envelope");
    assert.equal(await api.decryptMessageV3(envelope, privateKey), "plaintext");
    assert.equal(await api.computeSafetyNumberV3(publicKey, envelope), "fingerprint");
    assert.equal(await api.constantTimeEqualV3(plaintext, plaintext), true);
    assert.deepEqual(calls, [
      ["generate"],
      ["encrypt", plaintext, publicKey],
      ["decrypt", envelope, privateKey],
      ["safety", publicKey, envelope],
      ["equal", plaintext, plaintext],
    ]);
  });
});
