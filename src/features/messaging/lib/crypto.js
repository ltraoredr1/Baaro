/**
 * src/features/messaging/lib/crypto.js - E2E avec WebCrypto
 * AES-GCM 256 + ECDH P-256
 * Compatible avec useMessaging V5
 */
const AES_ALGO = "AES-GCM";
const ECDH_ALGO = "ECDH";
const CURVE = "P-256";

export async function generateKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: ECDH_ALGO, namedCurve: CURVE },
    true,
    ["deriveKey"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicJwk, privateJwk };
}

export async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: ECDH_ALGO, namedCurve: CURVE }, true, []);
}

export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: ECDH_ALGO, namedCurve: CURVE }, true, ["deriveKey"]);
}

async function deriveAesKey(privateKey, publicKey) {
  return crypto.subtle.deriveKey(
    { name: ECDH_ALGO, public: publicKey },
    privateKey,
    { name: AES_ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(plaintext, recipients) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const results = [];
  for (const r of recipients) {
    const pub = typeof r.publicKeyJwk === 'object' ? await importPublicKey(r.publicKeyJwk) : r.publicKeyJwk;
    // On dérive une clé éphémère par message pour forward secrecy simplifié
    const ephemeralPair = await crypto.subtle.generateKey({ name: ECDH_ALGO, namedCurve: CURVE }, true, ["deriveKey"]);
    const ephemeralPubJwk = await crypto.subtle.exportKey("jwk", ephemeralPair.publicKey);
    const aesKey = await deriveAesKey(ephemeralPair.privateKey, pub);
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, aesKey, encoded);
    results.push({
      user_id: r.user_id,
      iv: Array.from(iv),
      ephemeralPublicKey: ephemeralPubJwk,
      ciphertext: Array.from(new Uint8Array(ciphertext))
    });
  }
  return { recipients: results, iv: Array.from(iv) };
}

export async function decryptMessage(payload, privateKey, myUserId) {
  try {
    const myEntry = payload.recipients?.find(r => r.user_id === myUserId) || payload.recipients?.[0];
    if (!myEntry) return null;
    const ephemeralPub = await importPublicKey(myEntry.ephemeralPublicKey);
    const aesKey = await deriveAesKey(privateKey, ephemeralPub);
    const iv = new Uint8Array(myEntry.iv || payload.iv);
    const ct = new Uint8Array(myEntry.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: AES_ALGO, iv }, aesKey, ct);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.warn("decrypt fail", e.message);
    return null;
  }
}

export function serializePayload(payload) {
  return JSON.stringify({ __e2e: true, ...payload });
}

export function deserializePayload(text) {
  try {
    const obj = JSON.parse(text);
    if (obj.__e2e && obj.recipients) return obj;
    return null;
  } catch { return null; }
}
