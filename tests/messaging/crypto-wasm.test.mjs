import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  compute_safety_number,
  constant_time_equal,
  decrypt_message_v3,
  encrypt_message_v3,
  generate_identity_keypair,
  initSync,
} from "../../public/wasm/messaging_crypto.js";

const wasmBytes = readFileSync(
  new URL("../../public/wasm/messaging_crypto_bg.wasm", import.meta.url)
);
initSync({ module: wasmBytes });

describe("messaging crypto v3 WASM foundation", () => {
  it("generates X25519 identities and round-trips integrity-protected binary payloads", () => {
    const recipient = generate_identity_keypair();
    const privateKeySnapshot = recipient.privateKey.slice();
    const plaintext = new TextEncoder().encode("Message v3 — UTF-8 ✓");
    const envelope = encrypt_message_v3(plaintext, recipient.publicKey);

    assert.equal(
      new TextDecoder().decode(decrypt_message_v3(envelope, recipient.privateKey)),
      "Message v3 — UTF-8 ✓"
    );
    assert.equal(
      new TextDecoder().decode(decrypt_message_v3(envelope, recipient.privateKey)),
      "Message v3 — UTF-8 ✓"
    );
    assert.deepEqual(recipient.privateKey, privateKeySnapshot);
    assert.equal(new TextDecoder().decode(envelope.slice(0, 4)), "BAR3");
  });

  it("rejects an incorrect recipient and ciphertext tampering", () => {
    const recipient = generate_identity_keypair();
    const other = generate_identity_keypair();
    const envelope = encrypt_message_v3(new TextEncoder().encode("private"), recipient.publicKey);

    assert.throws(() => decrypt_message_v3(envelope, other.privateKey));
    const tampered = envelope.slice();
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decrypt_message_v3(tampered, recipient.privateKey));
    assert.throws(() => encrypt_message_v3(new TextEncoder().encode("x"), new Uint8Array(3)));
    assert.throws(() => encrypt_message_v3(new Uint8Array(0), recipient.publicKey));

    for (const headerOffset of [4, 36, 68]) {
      const headerTampered = envelope.slice();
      headerTampered[headerOffset] ^= 1;
      assert.throws(() => decrypt_message_v3(headerTampered, recipient.privateKey));
    }
  });

  it("creates an order-independent safety number and compares equal-length inputs", () => {
    const a = generate_identity_keypair();
    const b = generate_identity_keypair();

    assert.equal(compute_safety_number(a.publicKey, b.publicKey), compute_safety_number(b.publicKey, a.publicKey));
    assert.equal(constant_time_equal(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
    assert.equal(constant_time_equal(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
    assert.equal(constant_time_equal(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
  });
});
