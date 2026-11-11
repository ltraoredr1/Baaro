import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { webcrypto } from "node:crypto";
import {
  decryptMessage,
  deserializePayload,
  encryptMessage,
  importPublicKey,
  isEncryptedPayload,
  serializePayload,
} from "../../src/features/messaging/lib/crypto.js";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const RSA = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");
let alice;
let bob;

before(async () => {
  [alice, bob] = await Promise.all([
    webcrypto.subtle.generateKey(RSA, true, ["encrypt", "decrypt"]),
    webcrypto.subtle.generateKey(RSA, true, ["encrypt", "decrypt"]),
  ]);
});

describe("messaging E2E crypto compatibility", () => {
  it("encrypts v2 for multiple recipients and round-trips each recipient", async () => {
    const alicePublicJwk = await webcrypto.subtle.exportKey("jwk", alice.publicKey);
    const bobPublicJwk = await webcrypto.subtle.exportKey("jwk", bob.publicKey);
    const message = "Compatibilité E2E ✓ — caractères UTF-8";

    const payload = await encryptMessage(message, [
      { user_id: "alice", publicKeyJwk: alicePublicJwk },
      { user_id: "bob", publicKeyJwk: bobPublicJwk },
    ]);

    assert.equal(payload.v, 2);
    assert.equal(payload.alg, "RSA-OAEP+AES-GCM");
    assert.deepEqual(Object.keys(payload.keys).sort(), ["alice", "bob"]);
    assert.equal(await decryptMessage(payload, alice.privateKey, "alice"), message);
    assert.equal(await decryptMessage(payload, bob.privateKey, "bob"), message);
    assert.equal(await decryptMessage(payload, alice.privateKey, "bob"), null);
  });

  it("preserves legacy v1 single-recipient payload decryption", async () => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const aesKey = await webcrypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const rawAesKey = await webcrypto.subtle.exportKey("raw", aesKey);
    const plaintext = new TextEncoder().encode("ancien message v1");
    const ciphertext = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      aesKey,
      plaintext
    );
    const wrappedKey = await webcrypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      alice.publicKey,
      rawAesKey
    );
    const payload = {
      v: 1,
      alg: "RSA-OAEP+AES-GCM",
      ek: toBase64(new Uint8Array(wrappedKey)),
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(ciphertext)),
    };

    assert.equal(await decryptMessage(payload, alice.privateKey), "ancien message v1");
    assert.equal(await decryptMessage(payload, bob.privateKey), null);
  });

  it("serializes and deserializes v1/v2 without changing their envelope", async () => {
    const alicePublicJwk = await webcrypto.subtle.exportKey("jwk", alice.publicKey);
    const payload = await encryptMessage("round-trip", [
      { user_id: "alice", publicKeyJwk: alicePublicJwk },
    ]);
    const serialized = serializePayload(payload);
    const restored = deserializePayload(serialized);

    assert.equal(JSON.stringify(restored), serialized);
    assert.equal(isEncryptedPayload(serialized), true);
    assert.equal(isEncryptedPayload("not-json"), false);
    assert.equal(deserializePayload("{}"), null);
  });

  it("rejects malformed and unsupported payloads safely", async () => {
    const malformed = [
      null,
      {},
      { v: 3, alg: "RSA-OAEP+AES-GCM", iv: "AA==", ct: "AA==" },
      { v: 1, alg: "RSA-OAEP+AES-GCM", iv: "AA==", ct: "AA==" },
      { v: 2, alg: "RSA-OAEP+AES-GCM", keys: [], iv: "AA==", ct: "AA==" },
    ];

    for (const payload of malformed) {
      assert.equal(await decryptMessage(payload, alice.privateKey, "alice"), null);
    }

    assert.throws(() => serializePayload({ v: 3, alg: "future" }));
    assert.equal(deserializePayload('{"v":2,"alg":"RSA-OAEP+AES-GCM","keys":{},"iv":4,"ct":4}'), null);
  });

  it("fails closed when there is no valid recipient", async () => {
    await assert.rejects(() => encryptMessage("secret", []), /destinataire/i);
    await assert.rejects(
      () => encryptMessage("secret", [{ user_id: "missing", publicKeyJwk: null }]),
      /clé publique valide/i
    );
  });

  it("still validates and imports RSA public JWKs used by existing profiles", async () => {
    const jwk = await webcrypto.subtle.exportKey("jwk", alice.publicKey);
    const imported = await importPublicKey(jwk);
    assert.equal(imported.type, "public");
    assert.equal(imported.algorithm.name, "RSA-OAEP");
    await assert.rejects(() => importPublicKey({ kty: "OKP", crv: "X25519" }));
  });
});
