import { supabase } from "../supabaseClient.js";
import { uploadExternalMedia } from "./externalMedia.js";

const DEFAULT_WORKER = import.meta.env.VITE_BAARO_MEDIA_WORKER_URL || "";
/** Sous ce seuil : upload direct via /api/media (Vercel → R2). Au-delà : worker multipart. */
const DIRECT_MAX_BYTES = 500 * 1024 * 1024;
const SIGN_BATCH = 50;

function workerUrl(path) {
  if (!DEFAULT_WORKER) throw new Error("Worker média non configuré (VITE_BAARO_MEDIA_WORKER_URL)");
  return `\( {DEFAULT_WORKER.replace(/\/ \)/, "")}${path}`;
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expirée");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function post(path, body) {
  const response = await fetch(workerUrl(path), {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Erreur upload vidéo");
  return data;
}

function looksLikeVideo(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|mkv|3gp|avi)$/i.test(String(file.name || ""));
}

async function uploadDirect(file, onProgress, userId) {
  onProgress?.(20);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = userId || session?.user?.id;
  if (!uid) throw new Error("Session expirée");
  onProgress?.(40);
  const result = await uploadExternalMedia(file, {
    folder: "videos",
    userId: uid,
    maxBytes: DIRECT_MAX_BYTES,
  });
  onProgress?.(100);
  return result;
}

async function uploadViaWorker(file, onProgress) {
  const prepared = await post("/upload/prepare", {
    size: file.size,
    contentType: file.type || "video/mp4",
    fileName: file.name || "video.mp4",
  });
  const uploadedParts = [];
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
        const response = await fetch(item.url, {
          method: "PUT",
          body: file.slice(start, end),
        });
        if (!response.ok) {
          throw new Error(`Échec de l'upload de la partie ${item.partNumber}`);
        }
        uploadedParts.push({
          PartNumber: item.partNumber,
          ETag: response.headers.get("ETag") || "",
        });
        onProgress?.(Math.round((uploadedParts.length / prepared.partCount) * 100));
      }
    }
    const completed = await post("/upload/complete", {
      uploadId: prepared.uploadId,
      key: prepared.key,
      parts: uploadedParts,
    });
    return {
      url: completed.url,
      path: completed.key,
      provider: "cloudflare-r2",
      size: file.size,
      mime: file.type || "video/mp4",
      fileName: file.name || "video.mp4",
    };
  } catch (error) {
    await post("/upload/abort", {
      uploadId: prepared.uploadId,
      key: prepared.key,
    }).catch(() => {});
    throw error;
  }
}

/**
 * ≤ 500 Mo  → /api/media (Vercel + R2)
 * > 500 Mo  → worker Render (multipart)
 * Si le worker échoue (CORS / Failed to fetch) → fallback direct si taille ≤ 500 Mo
 */
export async function uploadLargeVideo(file, { onProgress, userId } = {}) {
  if (!file?.size) throw new Error("Vidéo invalide");
  if (!looksLikeVideo(file)) throw new Error("Vidéo invalide");

  const useWorker = file.size > DIRECT_MAX_BYTES && Boolean(DEFAULT_WORKER);

  if (!useWorker) {
    return uploadDirect(file, onProgress, userId);
  }

  try {
    return await uploadViaWorker(file, onProgress);
  } catch (error) {
    const msg = String(error?.message || error || "");
    // Si failed to fetch / CORS et fichier encore acceptable en direct
    if (
      file.size <= DIRECT_MAX_BYTES &&
      (/failed to fetch|network|cors|load failed/i.test(msg) || error?.name === "TypeError")
    ) {
      console.warn("[BAARO] Worker KO, fallback /api/media:", msg);
      return uploadDirect(file, onProgress, userId);
    }
    throw error;
  }
}
