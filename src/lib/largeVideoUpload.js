import { supabase } from "../supabaseClient.js";

const DEFAULT_WORKER = import.meta.env.VITE_BAARO_MEDIA_WORKER_URL || "";
const SIGN_BATCH = 50;

function workerUrl(path) {
  if (!DEFAULT_WORKER) throw new Error("Worker média non configuré (VITE_BAARO_MEDIA_WORKER_URL)");
  return `${DEFAULT_WORKER.replace(/\/$/, "")}${path}`;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session expirée");
  return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
}

async function post(path, body) {
  const response = await fetch(workerUrl(path), { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Erreur upload vidéo");
  return data;
}

export async function uploadLargeVideo(file, { onProgress } = {}) {
  if (!file?.size || !file.type.startsWith("video/")) throw new Error("Vidéo invalide");
  const prepared = await post("/upload/prepare", { size: file.size, contentType: file.type, fileName: file.name });
  const uploadedParts = [];
  try {
    for (let first = 1; first <= prepared.partCount; first += SIGN_BATCH) {
      const count = Math.min(SIGN_BATCH, prepared.partCount - first + 1);
      const { urls } = await post("/upload/sign-parts", { uploadId: prepared.uploadId, key: prepared.key, firstPart: first, count });
      for (const item of urls) {
        const start = (item.partNumber - 1) * prepared.partSize;
        const end = Math.min(file.size, start + prepared.partSize);
        const response = await fetch(item.url, { method: "PUT", body: file.slice(start, end) });
        if (!response.ok) throw new Error(`Échec de l'upload de la partie ${item.partNumber}`);
        uploadedParts.push({ PartNumber: item.partNumber, ETag: response.headers.get("ETag") || "" });
        onProgress?.(Math.round((uploadedParts.length / prepared.partCount) * 100));
      }
    }
    const completed = await post("/upload/complete", { uploadId: prepared.uploadId, key: prepared.key, parts: uploadedParts });
    return { url: completed.url, path: completed.key, provider: "cloudflare-r2", size: file.size, mime: file.type, fileName: file.name };
  } catch (error) {
    await post("/upload/abort", { uploadId: prepared.uploadId, key: prepared.key }).catch(() => {});
    throw error;
  }
}
