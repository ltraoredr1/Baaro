import { getSetting } from "./appSettings.js";
import { planLruEvictions } from "./offlineCachePolicy.js";

const DB_NAME = "baaro_offline_content_v1";
const STORE = "entries";
const DB_VERSION = 1;
const LIMIT_KEY = "baaro:offline:storage-limit-mb";
const DEFAULT_LIMIT_MB = 100;
const AVAILABLE_LIMITS_MB = [25, 50, 100, 200, 500];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS_PER_POST = 8;
let writeQueue = Promise.resolve();
const cacheJobs = new Map();

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponible sur cet appareil."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Ouverture du cache impossible."));
  });
}

async function readAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || tx.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function putEntry(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Écriture du cache impossible.")); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Écriture du cache annulée.")); };
  });
}

async function deleteKeys(keys) {
  if (!keys.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    keys.forEach((key) => store.delete(key));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Nettoyage du cache impossible.")); };
  });
}

function serialWrite(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

function bytesOf(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return 0; }
}

export function getOfflineStorageLimitMb() {
  try {
    const value = Number(localStorage.getItem(LIMIT_KEY));
    return AVAILABLE_LIMITS_MB.includes(value) ? value : DEFAULT_LIMIT_MB;
  } catch { return DEFAULT_LIMIT_MB; }
}

export async function setOfflineStorageLimitMb(value) {
  const mb = Number(value);
  if (!AVAILABLE_LIMITS_MB.includes(mb)) throw new Error("Limite de stockage non prise en charge.");
  try { localStorage.setItem(LIMIT_KEY, String(mb)); }
  catch { throw new Error("Impossible d’enregistrer la limite de stockage sur cet appareil."); }
  await serialWrite(() => trimToLimit());
  emitChange();
  return getOfflineCacheStats();
}

function limitBytes() { return getOfflineStorageLimitMb() * 1024 * 1024; }
function emitChange() {
  try { window.dispatchEvent(new CustomEvent("baaro:offline-content-cache")); } catch { /* environnements sans DOM */ }
}

async function trimToLimit(protectKey = null, alsoProtectKey = null) {
  const entries = await readAll();
  const plan = planLruEvictions(
    entries,
    limitBytes(),
    [protectKey, alsoProtectKey].filter(Boolean)
  );
  await deleteKeys(plan.keysToEvict);
  if (plan.protectedKeyToEvict) await deleteKeys([plan.protectedKeyToEvict]);
}

async function storeWithinLimit(entry, alsoProtectKey = null) {
  await putEntry(entry);
  await trimToLimit(entry.key, alsoProtectKey);
  const entries = await readAll();
  return entries.some((candidate) => candidate.key === entry.key);
}

function postKey(userId, postId) { return `${userId}:publication:${postId}`; }
function mediaKey(userId, postId, index) { return `${userId}:photo:${postId}:${index}`; }
function normalizePhotos(post) {
  const raw = Array.isArray(post?.media_urls) ? post.media_urls : [];
  const candidates = raw.map((item) => typeof item === "string" ? { url: item, type: "image" } : item).filter(Boolean);
  if (!candidates.length && post?.media_url) candidates.push({ url: post.media_url, type: post.media_type || "image" });
  const seen = new Set();
  return candidates.filter((item) => {
    const url = item?.url;
    if (typeof url !== "string" || !/^https:\/\//i.test(url) || url.startsWith("blob:") || seen.has(url)) return false;
    const type = String(item.type || (/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url) ? "video" : "image")).toLowerCase();
    if (type !== "image") return false;
    seen.add(url);
    return true;
  }).slice(0, MAX_PHOTOS_PER_POST);
}

function normalizePost(post) {
  const profile = post.profiles || {
    display_name: post.display_name,
    handle: String(post.handle || "").replace(/^@/, ""),
    flag: post.flag,
    avatar_url: post.avatar || post.avatar_url,
  };
  const photos = normalizePhotos(post);
  return {
    id: post.id,
    author_id: post.author_id,
    text: typeof post.text === "string" ? post.text : "",
    created_at: post.created_at || new Date().toISOString(),
    media_url: photos[0]?.url || null,
    media_type: photos.length ? "image" : null,
    media_urls: photos,
    likes_count: Number(post.likes_count ?? post.likes) || 0,
    reposts_count: Number(post.reposts_count) || 0,
    comments_count: Number(post.comments_count) || 0,
    views_count: Number(post.views_count) || 0,
    profiles: {
      display_name: profile.display_name || "Membre BAARO",
      handle: profile.handle || "membre",
      flag: profile.flag || "🌍",
      avatar_url: profile.avatar_url || "",
    },
  };
}

async function fetchPhoto(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    const announcedSize = Number(response.headers.get("content-length")) || 0;
    if (!type.toLowerCase().startsWith("image/") || announcedSize > MAX_PHOTO_BYTES) return null;
    if (!response.body?.getReader) {
      const blob = await response.blob();
      return blob.size <= MAX_PHOTO_BYTES ? blob : null;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return new Blob(chunks, { type: type.split(";")[0] || "image/jpeg" });
  } finally { clearTimeout(timer); }
}

/** Stocke une publication explicitement enregistrée et tente de mettre ses photos R2 en cache. */
export function cacheSavedPublication(userId, inputPost) {
  if (!userId || !inputPost?.id) return Promise.resolve({ saved: false, cachedPhotos: 0, skippedPhotos: 0 });
  const jobKey = postKey(userId, inputPost.id);
  if (cacheJobs.has(jobKey)) return cacheJobs.get(jobKey);
  const job = cacheSavedPublicationImpl(userId, inputPost).finally(() => cacheJobs.delete(jobKey));
  cacheJobs.set(jobKey, job);
  return job;
}

async function cacheSavedPublicationImpl(userId, inputPost) {
  if (!userId || !inputPost?.id) return { saved: false, cachedPhotos: 0, skippedPhotos: 0 };
  if (getSetting("local_cache") === false) throw new Error("Le cache local est désactivé dans les réglages.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Une connexion est nécessaire pour télécharger la publication et ses photos dans le cache local.");
  }
  const post = normalizePost(inputPost);
  const key = postKey(userId, post.id);
  const postEntry = { key, userId, postId: post.id, kind: "publication", data: post, bytes: bytesOf(post), savedAt: Date.now(), lastAccessedAt: Date.now() };
  const saved = await serialWrite(() => storeWithinLimit(postEntry));
  if (!saved) return { saved: false, cachedPhotos: 0, skippedPhotos: normalizePhotos(inputPost).length, reason: "limit" };

  let cachedPhotos = 0;
  let skippedPhotos = 0;
  const photos = normalizePhotos(inputPost);
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    try {
      const photoEntryKey = mediaKey(userId, post.id, index);
      const existing = (await readAll()).find((entry) => entry.key === photoEntryKey);
      if (existing?.originalUrl === photo.url && existing.blob instanceof Blob) {
        await serialWrite(() => putEntry({ ...existing, lastAccessedAt: Date.now() }));
        cachedPhotos += 1;
        continue;
      }
      const blob = await fetchPhoto(photo.url);
      if (!blob) { skippedPhotos += 1; continue; }
      const entry = {
        key: photoEntryKey, userId, postId: post.id, kind: "photo",
        originalUrl: photo.url, blob, bytes: blob.size, mimeType: blob.type,
        savedAt: Date.now(), lastAccessedAt: Date.now(),
      };
      const stored = await serialWrite(() => storeWithinLimit(entry, key));
      if (stored) cachedPhotos += 1;
      else skippedPhotos += 1;
    } catch {
      skippedPhotos += 1;
    }
  }
  emitChange();
  return { saved: true, cachedPhotos, skippedPhotos };
}

export async function removeCachedPublication(userId, postId) {
  if (!userId || !postId) return;
  await serialWrite(async () => {
    const entries = await readAll();
    await deleteKeys(entries.filter((entry) => entry.userId === userId && entry.postId === postId).map((entry) => entry.key));
  });
  emitChange();
}

export async function hasCachedSavedPublication(userId, postId) {
  if (!userId || !postId || getSetting("local_cache") === false) return false;
  const entries = await readAll();
  return entries.some((entry) => entry.key === postKey(userId, postId) && entry.kind === "publication");
}

/** Retourne les publications enregistrées pour le feed hors ligne et crée des URL blob pour les photos locales. */
export async function getCachedSavedPublications(userId) {
  if (!userId || getSetting("local_cache") === false) return [];
  const entries = await readAll();
  const posts = entries.filter((entry) => entry.userId === userId && entry.kind === "publication");
  const urlsToTouch = [];
  const hydrated = [];
  for (const entry of posts) {
    const photoEntries = entries.filter((candidate) => candidate.userId === userId && candidate.postId === entry.postId && candidate.kind === "photo");
    const photoByUrl = new Map(photoEntries.map((photo) => [photo.originalUrl, photo]));
    const media = [];
    const requestedPhotos = Array.isArray(entry.data?.media_urls) ? entry.data.media_urls : [];
    for (const requested of requestedPhotos) {
      const photo = photoByUrl.get(requested.url);
      if (!photo) continue;
      if (!(photo.blob instanceof Blob)) continue;
      const url = URL.createObjectURL(photo.blob);
      media.push({ url, type: "image" });
      urlsToTouch.push(photo.key);
    }
    const original = entry.data;
    urlsToTouch.push(entry.key);
    hydrated.push({
      ...original,
      media_urls: media,
      media_url: media[0]?.url || null,
      media_type: media.length ? "image" : null,
    });
  }
  if (urlsToTouch.length) {
    void serialWrite(async () => {
      const current = await readAll();
      const now = Date.now();
      await Promise.all(current.filter((entry) => urlsToTouch.includes(entry.key)).map((entry) => putEntry({ ...entry, lastAccessedAt: now })));
    });
  }
  return hydrated.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getOfflineCacheStats(userId = null) {
  const entries = await readAll();
  const ownedEntries = userId ? entries.filter((entry) => entry.userId === userId) : entries;
  return {
    usedBytes: entries.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0),
    limitBytes: limitBytes(),
    limitMb: getOfflineStorageLimitMb(),
    publicationCount: ownedEntries.filter((entry) => entry.kind === "publication").length,
    photoCount: ownedEntries.filter((entry) => entry.kind === "photo").length,
  };
}

export async function clearOfflineContentCache(userId = null) {
  await serialWrite(async () => {
    const entries = await readAll();
    await deleteKeys(entries.filter((entry) => !userId || entry.userId === userId).map((entry) => entry.key));
  });
  emitChange();
}

export const OFFLINE_CACHE_LIMITS_MB = AVAILABLE_LIMITS_MB;
