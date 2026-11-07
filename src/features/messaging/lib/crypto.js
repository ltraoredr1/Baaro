/**
 * BAARO — Chiffrement de bout en bout (E2E)
 *
 * Architecture hybride :
 * 1. RSA-OAEP 2048 bits + SHA-256 : protection de la clé AES.
 * 2. AES-GCM 256 bits : chiffrement du message.
 *
 * Compatibilité :
 * - Ancien format v1 : ek
 * - Format v2 : keys[user_id]
 *
 * Sécurité :
 * - Clé privée stockée non extractible dans IndexedDB, UNE entrée PAR COMPTE
 *   ("private-key:<userId>"). L'ancienne entrée unique "private-key" est
 *   conservée comme clé « héritée » (legacy) et reprise uniquement si sa
 *   clé publique correspond à celle du compte (voir adoptLegacyKeyPair).
 * - Sauvegarde de la clé privée chiffrée par une phrase secrète
 *   (PBKDF2 600 000 itérations + AES-GCM). Le serveur ne voit jamais
 *   la clé en clair : le E2E est conservé.
 * - Une clé n'est JAMAIS créée automatiquement si le compte en possède
 *   déjà une côté serveur (voir useCryptoKeys).
 */

const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGORITHM = {
  name: "AES-GCM",
  length: 256,
};

const DB_NAME = "baaro-crypto";
const DB_VERSION = 1;
const STORE_NAME = "keys";

// Ancienne clé unique (avant les clés par compte).
const LEGACY_KEY_ID = "private-key";

// Entrée IndexedDB d'un compte. Sans userId : ancienne entrée unique.
function keyIdFor(userId) {
  return userId ? `${LEGACY_KEY_ID}:${userId}` : LEGACY_KEY_ID;
}

const AES_IV_LENGTH = 12;
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_RECIPIENTS = 100;

const BACKUP_VERSION = 1;
const BACKUP_PBKDF2_ITERATIONS = 600000;
const BACKUP_MIN_PASSPHRASE = 8;

// Créations en cours, par entrée (évite deux générations simultanées).
const keyPairPromises = new Map();

// ─── Vérifications ──────────────────────────────────────────────────────────

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API indisponible sur cet appareil.");
  }

  return globalThis.crypto;
}

function validatePublicKeyJwk(jwk) {
  if (
    !jwk ||
    typeof jwk !== "object" ||
    jwk.kty !== "RSA" ||
    typeof jwk.n !== "string" ||
    typeof jwk.e !== "string" ||
    !jwk.n ||
    !jwk.e
  ) {
    throw new Error("Clé publique RSA invalide.");
  }

  if (jwk.alg && jwk.alg !== "RSA-OAEP-256") {
    throw new Error("Algorithme de clé publique non autorisé.");
  }

  return jwk;
}

function validatePrivateCryptoKey(key) {
  if (
    !key ||
    key.type !== "private" ||
    key.algorithm?.name !== "RSA-OAEP" ||
    !key.usages?.includes("decrypt")
  ) {
    throw new Error("Clé privée cryptographique invalide.");
  }

  return key;
}

// ─── Helpers binaires ───────────────────────────────────────────────────────

function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToBuf(base64) {
  if (
    typeof base64 !== "string" ||
    !base64 ||
    base64.length > MAX_MESSAGE_BYTES * 2 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    throw new Error("Données Base64 invalides.");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// ─── IndexedDB ──────────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB indisponible sur cet appareil."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => db.close();

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error("Ouverture IndexedDB impossible."));
    };

    request.onblocked = () => {
      reject(new Error("Ouverture IndexedDB bloquée par un autre onglet."));
    };
  });
}

async function idbGet(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);

    let result = null;

    request.onsuccess = () => {
      result = request.result ?? null;
    };

    request.onerror = () => {
      reject(request.error || new Error("Lecture IndexedDB impossible."));
    };

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Transaction IndexedDB échouée."));
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Transaction IndexedDB annulée."));
    };
  });
}

async function idbSet(key, value) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Écriture IndexedDB impossible."));
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Écriture IndexedDB annulée."));
    };
  });
}

async function idbDelete(key) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");

    tx.objectStore(STORE_NAME).delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Suppression IndexedDB impossible."));
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Suppression IndexedDB annulée."));
    };
  });
}

// ─── Import des clés ────────────────────────────────────────────────────────

async function importPrivateKey(jwk) {
  if (!jwk || typeof jwk !== "object" || jwk.kty !== "RSA") {
    throw new Error("Clé privée invalide.");
  }

  const key = await getCrypto().subtle.importKey(
    "jwk",
    jwk,
    RSA_ALGORITHM,
    false,
    ["decrypt"]
  );

  return validatePrivateCryptoKey(key);
}

export async function importPublicKey(jwk) {
  validatePublicKeyJwk(jwk);

  return getCrypto().subtle.importKey("jwk", jwk, RSA_ALGORITHM, false, [
    "encrypt",
  ]);
}

// ─── Code de récupération ───────────────────────────────────────────────────

/**
 * Génère un code de récupération aléatoire et sécurisé.
 */
export function generateRecoveryCode() {
  const array = new Uint8Array(16);
  getCrypto().getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .match(/.{1,4}/g)
    .join("-");
}

/**
 * Normalise l'entrée utilisateur pour la phrase de récupération ou le code.
 */
export function normalizeRecoveryInput(input) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/[\s-]+/g, "").toUpperCase();
}

// ─── Sauvegarde protégée par phrase secrète ─────────────────────────────────

async function deriveWrapKey(passphrase, salt, iterations) {
  const subtle = getCrypto().subtle;

  const base = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    AES_ALGORITHM,
    false,
    ["encrypt", "decrypt"]
  );
}

function assertPassphrase(passphrase) {
  if (
    typeof passphrase !== "string" ||
    passphrase.length < BACKUP_MIN_PASSPHRASE
  ) {
    throw new Error(
      `Phrase secrète trop courte (${BACKUP_MIN_PASSPHRASE} caractères minimum).`
    );
  }
}

async function buildBackup(privateKeyJwk, publicKeyJwk, passphrase) {
  assertPassphrase(passphrase);

  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(AES_IV_LENGTH));

  const wrapKey = await deriveWrapKey(
    passphrase,
    salt,
    BACKUP_PBKDF2_ITERATIONS
  );

  const ciphertext = await c.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    wrapKey,
    new TextEncoder().encode(JSON.stringify(privateKeyJwk))
  );

  return {
    v: BACKUP_VERSION,
    iter: BACKUP_PBKDF2_ITERATIONS,
    publicKeyJwk,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ct: bufToBase64(ciphertext),
  };
}

/**
 * Restaure la paire de clés locale du compte depuis une sauvegarde.
 * Lève "Phrase secrète incorrecte." si la phrase ne convient pas.
 */
export async function restoreFromBackup(backup, passphrase, userId = null) {
  if (
    !backup ||
    backup.v !== BACKUP_VERSION ||
    !Number.isInteger(backup.iter) ||
    backup.iter < 100000 ||
    backup.iter > 5000000
  ) {
    throw new Error("Sauvegarde de clé invalide.");
  }

  if (typeof passphrase !== "string" || !passphrase) {
    throw new Error("Phrase secrète incorrecte.");
  }

  let privateKeyJwk;

  try {
    const wrapKey = await deriveWrapKey(
      passphrase,
      new Uint8Array(base64ToBuf(backup.salt)),
      backup.iter
    );

    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(base64ToBuf(backup.iv)),
        tagLength: 128,
      },
      wrapKey,
      base64ToBuf(backup.ct)
    );

    privateKeyJwk = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Phrase secrète incorrecte.");
  }

  const publicKeyJwk = validatePublicKeyJwk(backup.publicKeyJwk);
  const privateKey = await importPrivateKey(privateKeyJwk);

  await idbSet(keyIdFor(userId), { publicKeyJwk, privateKey, version: 2 });

  return { publicKeyJwk, privateKey };
}

// ─── Génération / récupération des clés ─────────────────────────────────────

async function createKeyPair(passphrase, userId) {
  assertPassphrase(passphrase);

  const subtle = getCrypto().subtle;

  const generated = await subtle.generateKey(RSA_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);

  const publicKeyJwk = await subtle.exportKey("jwk", generated.publicKey);
  const privateKeyJwk = await subtle.exportKey("jwk", generated.privateKey);

  const backup = await buildBackup(privateKeyJwk, publicKeyJwk, passphrase);

  const privateKey = await importPrivateKey(privateKeyJwk);

  await idbSet(keyIdFor(userId), { publicKeyJwk, privateKey, version: 2 });

  return { publicKeyJwk, privateKey, backup };
}

async function loadStoredKeyPair(stored, keyId) {
  if (!stored) return null;

  if (stored.privateKey) {
    const privateKey = validatePrivateCryptoKey(stored.privateKey);
    const publicKeyJwk = validatePublicKeyJwk(stored.publicKeyJwk);

    return { publicKeyJwk, privateKey };
  }

  if (stored.privateKeyJwk && stored.publicKeyJwk) {
    const publicKeyJwk = validatePublicKeyJwk(stored.publicKeyJwk);
    const privateKey = await importPrivateKey(stored.privateKeyJwk);

    // Migration : on remplace le JWK extractible par une clé non extractible.
    await idbSet(keyId, { publicKeyJwk, privateKey, version: 2 });

    return { publicKeyJwk, privateKey };
  }

  return null;
}

export async function getLocalKeyPair(userId = null) {
  const keyId = keyIdFor(userId);

  return loadStoredKeyPair(await idbGet(keyId), keyId);
}

export async function clearLocalKeyPair(userId = null) {
  await idbDelete(keyIdFor(userId));
}

// Compare deux clés publiques RSA (module + exposant).
function sameRsaPublicKey(a, b) {
  if (!a || !b) return false;

  const parse = (v) => {
    try {
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch {
      return null;
    }
  };

  const keyA = parse(a);
  const keyB = parse(b);

  return !!(
    keyA &&
    keyB &&
    keyA.kty === "RSA" &&
    keyB.kty === "RSA" &&
    keyA.n === keyB.n &&
    keyA.e === keyB.e
  );
}

/**
 * Reprise de l'ancienne clé unique (avant les clés par compte).
 * Elle n'est adoptée QUE si sa clé publique est celle du compte (serverPublicKey).
 * Retourne la paire adoptée, ou null (jamais d'exception pour une absence
 * ou une non-correspondance : l'appelant bascule alors en récupération).
 */
export async function adoptLegacyKeyPair(userId, serverPublicKey) {
  if (!userId || !serverPublicKey) return null;

  let legacy = null;

  try {
    legacy = await getLocalKeyPair(null);
  } catch {
    return null;
  }

  if (!legacy) return null;

  if (!sameRsaPublicKey(legacy.publicKeyJwk, serverPublicKey)) {
    return null;
  }

  await idbSet(keyIdFor(userId), {
    publicKeyJwk: legacy.publicKeyJwk,
    privateKey: legacy.privateKey,
    version: 2,
  });

  return { publicKeyJwk: legacy.publicKeyJwk, privateKey: legacy.privateKey };
}

export async function ensureKeyPair({ userId = null, allowCreate = false, passphrase } = {}) {
  const existing = await getLocalKeyPair(userId);

  if (existing) return existing;
  if (!allowCreate) return null;

  const keyId = keyIdFor(userId);

  if (!keyPairPromises.has(keyId)) {
    const task = createKeyPair(passphrase, userId).finally(() => {
      keyPairPromises.delete(keyId);
    });

    keyPairPromises.set(keyId, task);
  }

  return keyPairPromises.get(keyId);
}

export async function getLocalPrivateKey(userId = null) {
  const pair = await getLocalKeyPair(userId);

  return pair?.privateKey || null;
}

export async function getLocalPublicKeyJwk(userId = null) {
  const pair = await getLocalKeyPair(userId);

  return pair?.publicKeyJwk || null;
}

// ─── Chiffrement ────────────────────────────────────────────────────────────

export async function encryptMessage(plaintext, recipients) {
  if (typeof plaintext !== "string" || !plaintext.length) {
    throw new Error("Message vide ou invalide.");
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error("Aucun destinataire fourni.");
  }

  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error("Nombre de destinataires trop élevé.");
  }

  const subtle = getCrypto().subtle;
  const encoded = new TextEncoder().encode(plaintext);

  if (encoded.byteLength > MAX_MESSAGE_BYTES) {
    throw new Error("Message trop volumineux pour le chiffrement.");
  }

  const aesKey = await subtle.generateKey(AES_ALGORITHM, true, [
    "encrypt",
    "decrypt",
  ]);

  const iv = getCrypto().getRandomValues(new Uint8Array(AES_IV_LENGTH));

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    aesKey,
    encoded
  );

  const rawAes = await subtle.exportKey("raw", aesKey);

  const keys = Object.create(null);

  for (const recipient of recipients) {
    const userId = recipient?.user_id;
    const publicKeyJwk = recipient?.publicKeyJwk;

    if (typeof userId !== "string" || !userId || !publicKeyJwk) {
      continue;
    }

    const publicKey = await importPublicKey(publicKeyJwk);

    const encryptedKey = await subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      rawAes
    );

    keys[userId] = bufToBase64(encryptedKey);
  }

  if (Object.keys(keys).length === 0) {
    throw new Error("Aucune clé publique valide parmi les destinataires.");
  }

  return {
    v: 2,
    alg: "RSA-OAEP+AES-GCM",
    keys,
    iv: bufToBase64(iv),
    ct: bufToBase64(ciphertext),
  };
}

// ─── Déchiffrement ──────────────────────────────────────────────────────────

export async function decryptMessage(payload, privateKey, my_user_id = null) {
  if (!payload || payload.alg !== "RSA-OAEP+AES-GCM" || !privateKey) {
    return null;
  }

  try {
    validatePrivateCryptoKey(privateKey);

    const subtle = getCrypto().subtle;

    let encryptedKeyBase64;

    if (payload.v === 2) {
      if (
        !payload.keys ||
        typeof payload.keys !== "object" ||
        !my_user_id ||
        !Object.prototype.hasOwnProperty.call(payload.keys, my_user_id)
      ) {
        return null;
      }

      encryptedKeyBase64 = payload.keys[my_user_id];
    } else if (payload.v === 1) {
      encryptedKeyBase64 = payload.ek;
    } else {
      return null;
    }

    const encryptedKey = base64ToBuf(encryptedKeyBase64);
    const iv = base64ToBuf(payload.iv);
    const ciphertext = base64ToBuf(payload.ct);

    if (iv.byteLength !== AES_IV_LENGTH) {
      return null;
    }

    if (
      ciphertext.byteLength < 16 ||
      ciphertext.byteLength > MAX_MESSAGE_BYTES + 16
    ) {
      return null;
    }

    const rawAes = await subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKey
    );

    if (rawAes.byteLength !== 32) {
      return null;
    }

    const aesKey = await subtle.importKey("raw", rawAes, AES_ALGORITHM, false, [
      "decrypt",
    ]);

    const plaintextBuf = await subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      aesKey,
      ciphertext
    );

    return new TextDecoder("utf-8", { fatal: true }).decode(plaintextBuf);
  } catch {
    console.warn("[BAARO crypto] Déchiffrement impossible.");
    return null;
  }
}

// ─── Sérialisation ──────────────────────────────────────────────────────────

export function serializePayload(payload) {
  if (
    !payload ||
    ![1, 2].includes(payload.v) ||
    payload.alg !== "RSA-OAEP+AES-GCM"
  ) {
    throw new Error("Payload cryptographique invalide.");
  }

  return JSON.stringify(payload);
}

export function deserializePayload(raw) {
  if (typeof raw !== "string" || !raw || raw.length > MAX_MESSAGE_BYTES * 2) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);

    if (
      !payload ||
      typeof payload !== "object" ||
      ![1, 2].includes(payload.v) ||
      payload.alg !== "RSA-OAEP+AES-GCM" ||
      typeof payload.iv !== "string" ||
      typeof payload.ct !== "string"
    ) {
      return null;
    }

    if (payload.v === 1 && typeof payload.ek !== "string") {
      return null;
    }

    if (
      payload.v === 2 &&
      (!payload.keys ||
        typeof payload.keys !== "object" ||
        Array.isArray(payload.keys))
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isEncryptedPayload(raw) {
  return deserializePayload(raw) !== null;
}
