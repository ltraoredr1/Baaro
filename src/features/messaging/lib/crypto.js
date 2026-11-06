
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
 * - Clé privée importée comme non extractible.
 * - Migration des anciennes clés privées JWK.
 * - Validation des clés et des payloads.
 * - IV aléatoire de 96 bits pour AES-GCM.
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
const KEY_ID = "private-key";

const AES_IV_LENGTH = 12;
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_RECIPIENTS = 100;

let keyPairPromise = null;

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
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
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

// ─── Import des clés ────────────────────────────────────────────────────────

async function importPrivateKey(jwk) {
  if (!jwk || typeof jwk !== "object" || jwk.kty !== "RSA") {
    throw new Error("Ancienne clé privée invalide.");
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

  return getCrypto().subtle.importKey(
    "jwk",
    jwk,
    RSA_ALGORITHM,
    false,
    ["encrypt"]
  );
}

// ─── Génération / récupération des clés ─────────────────────────────────────

async function createKeyPair() {
  const subtle = getCrypto().subtle;

  // Génération temporairement extractible pour exporter les clés.
  const generated = await subtle.generateKey(
    RSA_ALGORITHM,
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await subtle.exportKey(
    "jwk",
    generated.publicKey
  );

  const privateKeyJwk = await subtle.exportKey(
    "jwk",
    generated.privateKey
  );

  // Réimportation non extractible de la clé privée.
  const privateKey = await importPrivateKey(privateKeyJwk);

  // On ne conserve plus le JWK privé en clair dans IndexedDB.
  await idbSet(KEY_ID, {
    publicKeyJwk,
    privateKey,
    version: 2,
  });

  return {
    publicKeyJwk,
    privateKey,
  };
}

async function loadStoredKeyPair(stored) {
  if (!stored) return null;

  // Nouveau format : CryptoKey non extractible.
  if (stored.privateKey) {
    const privateKey = validatePrivateCryptoKey(stored.privateKey);

    const publicKeyJwk = validatePublicKeyJwk(
      stored.publicKeyJwk
    );

    return {
      publicKeyJwk,
      privateKey,
    };
  }

  // Migration de l'ancien format JWK.
  if (stored.privateKeyJwk && stored.publicKeyJwk) {
    const publicKeyJwk = validatePublicKeyJwk(
      stored.publicKeyJwk
    );

    const privateKey = await importPrivateKey(
      stored.privateKeyJwk
    );

    // Remplacement de l'ancien stockage par le nouveau.
    await idbSet(KEY_ID, {
      publicKeyJwk,
      privateKey,
      version: 2,
    });

    return {
      publicKeyJwk,
      privateKey,
    };
  }

  return null;
}

/**
 * Récupère ou crée la paire RSA locale.
 *
 * Retourne :
 * {
 *   publicKeyJwk,
 *   privateKey
 * }
 */
export async function ensureKeyPair() {
  if (keyPairPromise) {
    return keyPairPromise;
  }

  keyPairPromise = (async () => {
    const stored = await idbGet(KEY_ID);

    const existing = await loadStoredKeyPair(stored);

    if (existing) {
      return existing;
    }

    return createKeyPair();
  })();

  try {
    return await keyPairPromise;
  } finally {
    keyPairPromise = null;
  }
}

export async function getLocalPrivateKey() {
  const stored = await idbGet(KEY_ID);

  if (!stored) return null;

  const pair = await loadStoredKeyPair(stored);

  return pair?.privateKey || null;
}

export async function getLocalPublicKeyJwk() {
  const { publicKeyJwk } = await ensureKeyPair();

  return publicKeyJwk;
}

// ─── Chiffrement ────────────────────────────────────────────────────────────

/**
 * Chiffre un message pour un ou plusieurs destinataires.
 *
 * Format v2 :
 * {
 *   v: 2,
 *   alg: "RSA-OAEP+AES-GCM",
 *   keys: { user_id: encryptedAESKey },
 *   iv: "...",
 *   ct: "..."
 * }
 */
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

  // Une clé AES unique par message.
  const aesKey = await subtle.generateKey(
    AES_ALGORITHM,
    true,
    ["encrypt", "decrypt"]
  );

  const iv = getCrypto().getRandomValues(
    new Uint8Array(AES_IV_LENGTH)
  );

  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128,
    },
    aesKey,
    encoded
  );

  const rawAes = await subtle.exportKey("raw", aesKey);

  const keys = Object.create(null);

  for (const recipient of recipients) {
    const userId = recipient?.user_id;
    const publicKeyJwk = recipient?.publicKeyJwk;

    if (
      typeof userId !== "string" ||
      !userId ||
      !publicKeyJwk
    ) {
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

/**
 * Déchiffre un payload v1 ou v2.
 */
export async function decryptMessage(
  payload,
  privateKey,
  my_user_id = null
) {
  if (
    !payload ||
    payload.alg !== "RSA-OAEP+AES-GCM" ||
    !privateKey
  ) {
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
        !Object.prototype.hasOwnProperty.call(
          payload.keys,
          my_user_id
        )
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

    const aesKey = await subtle.importKey(
      "raw",
      rawAes,
      AES_ALGORITHM,
      false,
      ["decrypt"]
    );

    const plaintextBuf = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
      },
      aesKey,
      ciphertext
    );

    return new TextDecoder("utf-8", {
      fatal: true,
    }).decode(plaintextBuf);
  } catch (err) {
    // Ne jamais exposer le contenu du message ou les clés dans les logs.
    console.warn(
      "[BAARO crypto] Déchiffrement impossible."
    );

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
  if (
    typeof raw !== "string" ||
    !raw ||
    raw.length > MAX_MESSAGE_BYTES * 2
  ) {
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
      (
        !payload.keys ||
        typeof payload.keys !== "object" ||
        Array.isArray(payload.keys)
      )
    ) {
      return null;
    }

    return payload;
  } catch {
    // Ancien message en clair ou JSON invalide.
    return null;
  }
}

export function isEncryptedPayload(raw) {
  return deserializePayload(raw) !== null;
}
