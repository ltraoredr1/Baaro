import { supabase } from "../supabaseClient.js";
import { uploadExternalMedia } from "./externalMedia.js";

const DEFAULT_WORKER = import.meta.env.VITE_BAARO_MEDIA_WORKER_URL || "";
const DIRECT_MAX_BYTES = 500 * 1024 * 1024;
const SIGN_BATCH = 50;
const PART_RETRIES = 3;

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
  // getSession() rafraichit le jeton si besoin : utile pour les envois longs
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

async function uploadDirect(file, onProgress, user_id) {
  onProgress?.(20);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = user_id || session?.user?.id;
  if (!uid) throw new Error("Session expiree");
  onProgress?.(40);

  // Certains mobiles envoient un fichier sans type MIME : on lui en donne un
  const typed = file.type && file.type.startsWith("video/")
    ? file
    : new File([file], file.name || "video.mp4", { type: resolveType(file) });

  const result = await uploadExternalMedia(typed, "videos");
  onProgress?.(100);
  return {
    ...result,
    url: result.url || result.publicUrl,
    publicUrl: result.publicUrl || result.url,
  };
}

/** Envoie une partie vers R2 (XHR pour suivre la progression octet par octet). */
function putPart(url, blob, onLoaded) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onLoaded(event.loaded);
    };
    xhr.onload = () => {
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
    xhr.onerror = () => reject(new Error("Erreur reseau"));
    xhr.ontimeout = () => reject(new Error("Delai depasse"));
    xhr.onabort = () => reject(new Error("Envoi annule"));
    xhr.send(blob);
  });
}

async function putPartWithRetry(url, blob, onLoaded, partNumber) {
  let lastError;
  for (let attempt = 1; attempt <= PART_RETRIES; attempt += 1) {
    try {
      onLoaded(0);
      return await putPart(url, blob, onLoaded);
    } catch (error) {
      lastError = error;
      if (error.fatal) break;
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

  const prepared = await post("/upload/prepare", {
    size: file.size,
    contentType,
    fileName,
  });

  const uploadedParts = [];
  let doneBytes = 0;
  try {
    for (let first = 1; first <= prepared.partCount; first += SIGN_BATCH) {
      const count = Math.min(SIGN_BATCH, prepared.partCount - first + 1);
      const { urls } = await post("/upload/sign-parts", {
        uploadId: prepared.uploadId,
        key: prepared.key,
        firstPart: first,
        count,
      });
      for (const item of urls) {
        const start = (item.partNumber - 1) * prepared.partSize;
        const end = Math.min(file.size, start + prepared.partSize);
        const etag = await putPartWithRetry(
          item.url,
          file.slice(start, end),
          (loaded) => {
            const pct = Math.floor(((doneBytes + loaded) / file.size) * 100);
            onProgress?.(Math.min(99, pct));
          },
          item.partNumber
        );
        doneBytes += end - start;
        uploadedParts.push({ PartNumber: item.partNumber, ETag: etag });
      }
    }

    const completed = await post("/upload/complete", {
      uploadId: prepared.uploadId,
      key: prepared.key,
      parts: uploadedParts,
    });
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
    await post("/upload/abort", {
      uploadId: prepared.uploadId,
      key: prepared.key,
    }).catch(() => {});
    throw error;
  }
}

/** Onglet Vidéos : <=500Mo R2 direct (/api/media), >500Mo worker Render (multipart) */
export async function uploadLargeVideo(file, { onProgress, user_id } = {}) {
  if (!file?.size) throw new Error("Video invalide");
  if (!looksLikeVideo(file)) throw new Error("Video invalide");

  if (file.size <= DIRECT_MAX_BYTES) {
    return uploadDirect(file, onProgress, user_id);
  }
  if (!DEFAULT_WORKER) {
    throw new Error("Fichier > 500 Mo : configure VITE_BAARO_MEDIA_WORKER_URL");
  }
  return uploadViaWorker(file, onProgress);
}
