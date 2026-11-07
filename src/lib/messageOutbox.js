/**
 * Mode Zéro Data — boîte d'envoi persistante des messages texte.
 *
 * Quand il n'y a pas de réseau, le message est gardé ici au lieu d'être perdu ou
 * marqué « échec ». Il repart dès que la connexion revient, même si l'app a été
 * fermée. L'envoi réel réutilise le même client_message_id (contrainte unique en base).
 *
 * SÉCURITÉ : plus aucun texte en clair dans localStorage. Les données sont chiffrées
 * au repos (AES-GCM 256) avec une clé NON EXTRACTIBLE stockée dans IndexedDB. Le texte
 * en clair n'existe qu'en mémoire. Si le chiffrement est indisponible, on garde en
 * mémoire seulement (jamais de repli en clair). À la déconnexion : wipeSecureStorage().
 *
 * Les fonctions restent synchrones (cache mémoire). Appeler `await initOutbox(userId)`
 * une fois au démarrage / après connexion.
 */
const KEY_PREFIX = "baaro_outbox_v2:";
const LEGACY_PREFIX = "baaro_outbox_v1:"; // ancien format en clair, migré puis supprimé
const MAX_ITEMS = 200;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const DB_NAME = "baaro_secure";
const STORE = "keys";
const KEY_ID = "local-v1";

/* ───────── Chiffrement au repos (réutilisable, ex. brouillons ChatInput) ───────── */

const hasCrypto = () =>
  typeof crypto !== "undefined" && !!crypto.subtle && typeof indexedDB !== "undefined";

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

let keyPromise = null;
function getKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      let key = await idb("readonly", (s) => s.get(KEY_ID));
      if (!key) {
        const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
          "encrypt",
          "decrypt",
        ]);
        // add() échoue si un autre onglet a déjà créé la clé : on relit alors la sienne
        try {
          await idb("readwrite", (s) => s.add(fresh, KEY_ID));
        } catch {
          /* clé déjà créée ailleurs */
        }
        key = await idb("readonly", (s) => s.get(KEY_ID));
      }
      return key;
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}

/** Chiffre un texte. `aad` lie le blob à son emplacement (anti-échange de blobs). */
export async function encryptString(text, aad = "") {
  if (!hasCrypto()) return null;
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(text)
    );
    return `v1.${b64(iv)}.${b64(ct)}`;
  } catch {
    return null;
  }
}

/** Déchiffre ; renvoie null si invalide, altéré ou clé perdue. */
export async function decryptString(blob, aad = "") {
  if (!hasCrypto() || typeof blob !== "string") return null;
  try {
    const [v, iv, ct] = blob.split(".");
    if (v !== "v1") return null;
    const key = await getKey();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv), additionalData: new TextEncoder().encode(aad) },
      key,
      unb64(ct)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Stockage chiffré clé/valeur (localStorage). Ne retombe jamais en clair. */
export async function setSecureItem(name, value) {
  try {
    if (value == null || value === "") return localStorage.removeItem(name);
    const blob = await encryptString(String(value), name);
    if (blob) localStorage.setItem(name, blob);
  } catch {
    /* quota plein : on ne casse jamais l'envoi pour ça */
  }
}

export async function getSecureItem(name) {
  try {
    const blob = localStorage.getItem(name);
    return blob ? await decryptString(blob, name) : null;
  } catch {
    return null;
  }
}

/** À appeler à la déconnexion : supprime la clé → tout blob restant devient illisible. */
export async function wipeSecureStorage() {
  keyPromise = null;
  cache.clear();
  loaded.clear();
  try {
    Object.keys(localStorage)
      .filter(
        (k) => k.startsWith(KEY_PREFIX) || k.startsWith(LEGACY_PREFIX) || k.startsWith("baaro:draft:")
      )
      .forEach((k) => localStorage.removeItem(k));
    if (hasCrypto()) await idb("readwrite", (s) => s.delete(KEY_ID));
  } catch {
    /* ignore */
  }
}

/* ───────── Boîte d'envoi ───────── */

const cache = new Map(); // userId -> items (en clair, mémoire uniquement)
const loaded = new Map(); // userId -> Promise du chargement initial
const chain = new Map(); // userId -> file d'écriture ordonnée

const keyFor = (userId) => `${KEY_PREFIX}${userId || "anon"}`;
const legacyKeyFor = (userId) => `${LEGACY_PREFIX}${userId || "anon"}`;

const fresh = (items) => {
  const now = Date.now();
  return (Array.isArray(items) ? items : []).filter(
    (m) => m && m.clientMessageId && now - (m.queuedAt || 0) < MAX_AGE_MS
  );
};

const mem = (userId) => cache.get(userId || "anon") || [];

function persist(userId) {
  const id = userId || "anon";
  const prev = chain.get(id) || Promise.resolve();
  const next = prev
    .then(() => loaded.get(id))
    .then(async () => {
      const items = fresh(mem(userId)).slice(-MAX_ITEMS);
      if (!items.length) return localStorage.removeItem(keyFor(userId));
      const blob = await encryptString(JSON.stringify(items), keyFor(userId));
      if (blob) localStorage.setItem(keyFor(userId), blob);
    })
    .catch(() => {});
  chain.set(id, next);
}

function commit(userId, items) {
  cache.set(userId || "anon", items.slice(-MAX_ITEMS));
  persist(userId);
  try {
    window.dispatchEvent(new CustomEvent("baaro:outbox"));
  } catch {
    /* ignore */
  }
}

/** Charge + déchiffre la boîte d'envoi, et migre l'ancien format en clair. */
export function initOutbox(userId) {
  const id = userId || "anon";
  if (loaded.has(id)) return loaded.get(id);
  const p = (async () => {
    let stored = [];
    const blob = localStorage.getItem(keyFor(userId));
    if (blob) {
      const json = await decryptString(blob, keyFor(userId));
      try {
        stored = fresh(JSON.parse(json || "[]"));
      } catch {
        stored = [];
      }
    }
    let legacy = [];
    try {
      legacy = fresh(JSON.parse(localStorage.getItem(legacyKeyFor(userId)) || "[]"));
    } catch {
      legacy = [];
    }
    // fusion : ce qui est déjà en mémoire gagne (doublons évités par clientMessageId)
    const merged = new Map();
    [...legacy, ...stored, ...mem(userId)].forEach((m) => merged.set(m.clientMessageId, m));
    cache.set(id, [...merged.values()].slice(-MAX_ITEMS));
    persist(userId);
    localStorage.removeItem(legacyKeyFor(userId)); // le clair disparaît dès la migration
    try {
      window.dispatchEvent(new CustomEvent("baaro:outbox"));
    } catch {
      /* ignore */
    }
  })().catch(() => {});
  loaded.set(id, p);
  return p;
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Une erreur qui ressemble à une coupure réseau (et non à un refus du serveur). */
export function isNetworkError(err) {
  if (isOffline()) return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    err?.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout")
  );
}

export function enqueueOutbox(userId, item) {
  initOutbox(userId);
  const items = fresh(mem(userId)).filter((m) => m.clientMessageId !== item.clientMessageId);
  items.push({ ...item, queuedAt: item.queuedAt || Date.now(), sms: item.sms || null });
  commit(userId, items);
}

export function updateOutbox(userId, clientMessageId, patch) {
  commit(
    userId,
    fresh(mem(userId)).map((m) => (m.clientMessageId === clientMessageId ? { ...m, ...patch } : m))
  );
}

export function removeFromOutbox(userId, clientMessageId) {
  commit(
    userId,
    fresh(mem(userId)).filter((m) => m.clientMessageId !== clientMessageId)
  );
}

export function getOutbox(userId, conversationId) {
  const all = fresh(mem(userId));
  return conversationId ? all.filter((m) => m.conversationId === conversationId) : all;
}

export function getOutboxSize(userId) {
  return fresh(mem(userId)).length;
}
