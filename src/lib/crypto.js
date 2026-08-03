/**
 * BAARO — Chiffrement de bout en bout (E2E)
 *
 * Architecture hybride :
 *  1. RSA-OAEP 2048 bits  → échange de la clé de session
 *  2. AES-GCM 256 bits    → chiffrement du message lui-même
 *
 * La clé privée ne quitte jamais l'appareil (IndexedDB).
 * Le serveur ne voit jamais le texte en clair.
 */

const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGORITHM = { name: "AES-GCM", length: 256 };
const DB_NAME = "baaro-crypto";
const STORE_NAME = "keys";
const KEY_ID = "private-key";

// ─── Helpers binaires ────────────────────────────────────────────────────────

function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ─── IndexedDB (stockage de la clé privée) ───────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Génération / import de clés ─────────────────────────────────────────────

/**
 * Génère une paire RSA-OAEP si elle n'existe pas encore sur cet appareil.
 * Retourne { publicKeyJwk, privateKey } (CryptoKey).
 */
export async function ensureKeyPair() {
  const stored = await idbGet(KEY_ID);

  if (stored?.privateKeyJwk && stored?.publicKeyJwk) {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      stored.privateKeyJwk,
      RSA_ALGORITHM,
      false,
      ["decrypt"]
    );
    return { publicKeyJwk: stored.publicKeyJwk, privateKey };
  }

  const keyPair = await crypto.subtle.generateKey(RSA_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  await idbSet(KEY_ID, { publicKeyJwk, privateKeyJwk });

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    RSA_ALGORITHM,
    false,
    ["decrypt"]
  );

  return { publicKeyJwk, privateKey };
}

export async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, RSA_ALGORITHM, false, ["encrypt"]);
}

export async function getLocalPrivateKey() {
  const stored = await idbGet(KEY_ID);
  if (!stored?.privateKeyJwk) return null;
  return crypto.subtle.importKey(
    "jwk",
    stored.privateKeyJwk,
    RSA_ALGORITHM,
    false,
    ["decrypt"]
  );
}

export async function getLocalPublicKeyJwk() {
  const { publicKeyJwk } = await ensureKeyPair();
  return publicKeyJwk;
}

// ─── Chiffrement / Déchiffrement hybride ─────────────────────────────────────

/**
 * Chiffre un texte clair pour un (ou plusieurs) destinataire(s).
 * Format v2 multi-destinataires (expéditeur + destinataire).
 */
export async function encryptMessage(plaintext, recipients) {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("Message vide ou invalide");
  }
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error("Aucun destinataire fourni");
  }

  const aesKey = await crypto.subtle.generateKey(AES_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  const rawAes = await crypto.subtle.exportKey("raw", aesKey);

  const keys = {};
  for (const { userId, publicKeyJwk } of recipients) {
    if (!userId || !publicKeyJwk) continue;
    const pubKey = await importPublicKey(publicKeyJwk);
    const encryptedKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      pubKey,
      rawAes
    );
    keys[userId] = bufToBase64(encryptedKey);
  }

  if (Object.keys(keys).length === 0) {
    throw new Error("Aucune clé publique valide parmi les destinataires");
  }

  return {
    v: 2,
    alg: "RSA-OAEP+AES-GCM",
    keys,
    iv: bufToBase64(iv),
    ct: bufToBase64(ciphertext),
  };
}

/**
 * Déchiffre un payload (v1 ou v2).
 */
export async function decryptMessage(payload, privateKey, myUserId = null) {
  if (!payload || !payload.alg || payload.alg !== "RSA-OAEP+AES-GCM") {
    return null;
  }
  if (!privateKey) return null;

  try {
    let encryptedKeyBuf;

    if (payload.v === 2 && payload.keys) {
      if (!myUserId || !payload.keys[myUserId]) return null;
      encryptedKeyBuf = base64ToBuf(payload.keys[myUserId]);
    } else if (payload.v === 1 && payload.ek) {
      encryptedKeyBuf = base64ToBuf(payload.ek);
    } else {
      return null;
    }

    const rawAes = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKeyBuf
    );

    const aesKey = await crypto.subtle.importKey(
      "raw",
      rawAes,
      AES_ALGORITHM,
      false,
      ["decrypt"]
    );

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(payload.iv) },
      aesKey,
      base64ToBuf(payload.ct)
    );

    return new TextDecoder().decode(plaintextBuf);
  } catch (err) {
    console.warn("[BAARO crypto] Échec déchiffrement :", err.message);
    return null;
  }
}

export function serializePayload(payload) {
  return JSON.stringify(payload);
}

export function deserializePayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && (obj.v === 1 || obj.v === 2) && obj.alg) return obj;
  } catch {
    // pas du JSON → ancien message en clair
  }
  return null;
}

export function isEncryptedPayload(raw) {
  return deserializePayload(raw) !== null;
}
