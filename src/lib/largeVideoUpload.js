import { supabase } from "../supabaseClient.js";
import { uploadExternalMedia } from "./externalMedia.js";

const DEFAULT_WORKER = import.meta.env.VITE_BAARO_MEDIA_WORKER_URL || "";
const DIRECT_MAX_BYTES = 500 * 1024 * 1024;
const SIGN_BATCH = 50;
const PART_RETRIES = 3;
const PART_CONCURRENCY = 4;

// File d'attente / reprise
const IDB_NAME = "baaro-upload-v1";
const IDB_STORE = "multipart";
const IDB_QUEUE = "queue";
const SESSION_TTL_MS = 48 * 60 * 60 * 1000; // 48 h

const MIME_BY_EXT = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
};

function extOf(name) {
  const match = String(name || "").match(/\.([a-z0-9]{1,10})$/i);
  return match ? match[1].toLowerCase() : "";
}

/** Vrai si le fichier est une vidéo (type MIME ou extension, certains mobiles n'envoient pas de type). */
export function looksLikeVideo(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  return Boolean(MIME_BY_EXT[extOf(file.name)]);
}

function resolveType(file) {
  if (file.type && file.type.startsWith("video/")) return file.type;
  return MIME_BY_EXT[extOf(file.name)] || "video/mp4";
}

function workerUrl(path) {
  if (!DEFAULT_WORKER) throw new Error("Worker media non configure");
  return DEFAULT_WORKER.replace(/\/$/, "") + path;
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expiree");
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + session.access_token,
  };
}

async function post(path, body) {
  let response;
  try {
    response = await fetch(workerUrl(path), {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error?.message === "Session expiree") throw error;
    throw new Error("Worker injoignable (reseau ou CORS)");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Erreur upload video");
  return data;
}

// ---------------------------------------------------------------------------
// IndexedDB minimal (sessions multipart + file d'attente)
// ---------------------------------------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(IDB_QUEUE)) {
        db.createObjectStore(IDB_QUEUE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

async function idbPut(storeName, value) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Pas bloquant si IDB indisponible
  }
}

async function idbGet(storeName, id) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbDelete(storeName, id) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

/** Identifiant stable d'un fichier pour la reprise (taille + nom + lastModified). */
function fileFingerprint(file) {
  return [
    file.name || "video",
    file.size || 0,
    file.lastModified || 0,
    file.type || "",
  ].join("|");
}

// ---------------------------------------------------------------------------
// Upload direct (<= 500 Mo)
// ---------------------------------------------------------------------------

async function uploadDirect(file, onProgress, user_id) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = user_id || session?.user?.id;
  if (!uid) throw new Error("Session expiree");
  onProgress?.(2);

  const typed =
    file.type && file.type.startsWith("video/")
      ? file
      : new File([file], file.name || "video.mp4", { type: resolveType(file) });

  // Quelques retries sur réseau intermittent
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await uploadExternalMedia(typed, {
        folder: "videos",
        onProgress: (pct) => onProgress?.(Math.min(99, Math.max(2, pct))),
      });
      onProgress?.(100);
      return {
        ...result,
        url: result.url || result.publicUrl,
        publicUrl: result.publicUrl || result.url,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
  }
  throw lastError || new Error("Echec upload direct");
}

// ---------------------------------------------------------------------------
// Multipart (> 500 Mo) avec reprise
// ---------------------------------------------------------------------------

function putPart(url, blob, onLoaded, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error("Envoi annule");
      error.fatal = true;
      reject(error);
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });

    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onLoaded(event.loaded);
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error("HTTP " + xhr.status));
        return;
      }
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        const error = new Error(
          "ETag illisible : ajoute ETag dans ExposeHeaders du CORS du bucket R2"
        );
        error.fatal = true;
        reject(error);
        return;
      }
      resolve(etag);
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Erreur reseau"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Delai depasse"));
    };
    xhr.onabort = () => {
      cleanup();
      const error = new Error("Envoi annule");
      error.fatal = true;
      reject(error);
    };
    xhr.send(blob);
  });
}

async function putPartWithRetry(url, blob, onLoaded, partNumber, signal) {
  let lastError;
  for (let attempt = 1; attempt <= PART_RETRIES; attempt += 1) {
    try {
      onLoaded(0);
      return await putPart(url, blob, onLoaded, signal);
    } catch (error) {
      lastError = error;
      if (error.fatal || signal?.aborted) break;
      if (attempt < PART_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }
  throw new Error(
    "Echec upload partie " + partNumber + " : " + (lastError?.message || "erreur inconnue")
  );
}

async function uploadViaWorker(file, onProgress) {
  const contentType = resolveType(file);
  const fileName = file.name || "video.mp4";
  const fingerprint = fileFingerprint(file);

  // Reprise éventuelle
  let session = await idbGet(IDB_STORE, fingerprint);
  if (session && Date.now() - (session.updatedAt || 0) > SESSION_TTL_MS) {
    await idbDelete(IDB_STORE, fingerprint);
    session = null;
  }

  let prepared;
  let uploadedParts = [];

  if (session?.uploadId && session?.key && Array.isArray(session.parts)) {
    prepared = {
      uploadId: session.uploadId,
      key: session.key,
      partSize: session.partSize,
    };
    uploadedParts = session.parts.slice();
    onProgress?.(Math.min(95, Math.round((uploadedParts.length / Math.max(1, session.totalParts || 1)) * 100)));
  } else {
    prepared = await post("/upload/prepare", {
      size: file.size,
      contentType,
      fileName,
    });
    uploadedParts = [];
    await idbPut(IDB_STORE, {
      id: fingerprint,
      uploadId: prepared.uploadId,
      key: prepared.key,
      partSize: prepared.partSize,
      totalParts: Math.ceil(file.size / prepared.partSize),
      parts: [],
      updatedAt: Date.now(),
      fileName,
      size: file.size,
    });
  }

  const controller = new AbortController();
  const loadedByPart = new Map();
  const donePartNumbers = new Set(uploadedParts.map((p) => p.PartNumber));

  const report = () => {
    let sum = 0;
    loadedByPart.forEach((value) => {
      sum += value;
    });
    donePartNumbers.forEach((n) => {
      if (!loadedByPart.has(n)) {
        const start = (n - 1) * prepared.partSize;
        const end = Math.min(file.size, start + prepared.partSize);
        sum += end - start;
      }
    });
    onProgress?.(Math.min(99, Math.round((sum / file.size) * 100)));
  };

  const persistParts = async () => {
    await idbPut(IDB_STORE, {
      id: fingerprint,
      uploadId: prepared.uploadId,
      key: prepared.key,
      partSize: prepared.partSize,
      totalParts: Math.ceil(file.size / prepared.partSize),
      parts: uploadedParts.slice(),
      updatedAt: Date.now(),
      fileName,
      size: file.size,
    });
  };

  try {
    const totalParts = Math.ceil(file.size / prepared.partSize);
    const missing = [];
    for (let n = 1; n <= totalParts; n += 1) {
      if (!donePartNumbers.has(n)) missing.push(n);
    }

    for (let offset = 0; offset < missing.length; offset += SIGN_BATCH) {
      const batch = missing.slice(offset, offset + SIGN_BATCH);
      if (batch.length === 0) break;

      const first = batch[0];
      const count = batch.length;

      const { urls } = await post("/upload/sign-parts", {
        uploadId: prepared.uploadId,
        key: prepared.key,
        firstPart: first,
        count,
      });

      const urlByPart = new Map(
        (urls || []).map((u) => [u.partNumber, u.url])
      );

      let cursor = 0;
      const runNext = async () => {
        while (cursor < batch.length) {
          if (controller.signal.aborted) return;
          const partNumber = batch[cursor];
          cursor += 1;

          if (donePartNumbers.has(partNumber)) continue;

          const url = urlByPart.get(partNumber);
          if (!url) {
            throw new Error("URL manquante pour la partie " + partNumber);
          }

          const start = (partNumber - 1) * prepared.partSize;
          const end = Math.min(file.size, start + prepared.partSize);

          const etag = await putPartWithRetry(
            url,
            file.slice(start, end),
            (loaded) => {
              loadedByPart.set(partNumber, loaded);
              report();
            },
            partNumber,
            controller.signal
          );

          loadedByPart.set(partNumber, end - start);
          report();
          uploadedParts.push({ PartNumber: partNumber, ETag: etag });
          donePartNumbers.add(partNumber);
          await persistParts();
        }
      };

      const workers = Array.from(
        { length: Math.min(PART_CONCURRENCY, batch.length) },
        () =>
          runNext().catch((error) => {
            controller.abort();
            throw error;
          })
      );
      await Promise.all(workers);
    }

    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    const completed = await post("/upload/complete", {
      uploadId: prepared.uploadId,
      key: prepared.key,
      parts: uploadedParts,
    });

    await idbDelete(IDB_STORE, fingerprint);
    onProgress?.(100);

    return {
      url: completed.url,
      publicUrl: completed.url,
      path: completed.key,
      object_key: completed.key,
      provider: "cloudflare-r2",
      size: file.size,
      mime: contentType,
      fileName,
    };
  } catch (error) {
    controller.abort();
    if (error?.fatal || error?.message === "Envoi annule") {
      await post("/upload/abort", {
        uploadId: prepared.uploadId,
        key: prepared.key,
      }).catch(() => {});
      await idbDelete(IDB_STORE, fingerprint);
    } else {
      await persistParts();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// File d'attente hors ligne
// ---------------------------------------------------------------------------

export async function enqueueOfflineUpload(meta) {
  const id = meta.id || `q-\( {Date.now()}- \){Math.random().toString(36).slice(2, 8)}`;
  await idbPut(IDB_QUEUE, {
    id,
    ...meta,
    createdAt: Date.now(),
    status: "pending",
  });
  return id;
}

export async function listOfflineQueue() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_QUEUE, "readonly");
      const req = tx.objectStore(IDB_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeFromOfflineQueue(id) {
  await idbDelete(IDB_QUEUE, id);
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export async function uploadLargeVideo(file, { onProgress, user_id, signal } = {}) {
  if (!file?.size) throw new Error("Video invalide");
  if (!looksLikeVideo(file)) throw new Error("Video invalide");

  if (isOffline()) {
    const err = new Error("Hors ligne : impossible d'envoyer la video maintenant");
    err.code = "OFFLINE";
    throw err;
  }

  if (signal?.aborted) {
    const err = new Error("Envoi annule");
    err.fatal = true;
    throw err;
  }

  const onAbort = () => {};
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (file.size <= DIRECT_MAX_BYTES) {
      return await uploadDirect(file, onProgress, user_id);
    }
    if (!DEFAULT_WORKER) {
      throw new Error("Fichier > 500 Mo : configure VITE_BAARO_MEDIA_WORKER_URL");
    }
    return await uploadViaWorker(file, onProgress);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function listResumableUploads() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => {
        const now = Date.now();
        const list = (req.result || []).filter(
          (s) => now - (s.updatedAt || 0) < SESSION_TTL_MS
        );
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function abortResumableUpload(fingerprint) {
  const session = await idbGet(IDB_STORE, fingerprint);
  if (session?.uploadId && session?.key && DEFAULT_WORKER) {
    await post("/upload/abort", {
      uploadId: session.uploadId,
      key: session.key,
    }).catch(() => {});
  }
  await idbDelete(IDB_STORE, fingerprint);
}
