import { Capacitor } from "@capacitor/core";
import { supabase } from "../supabaseClient.js";

/**
 * Upload média vers R2 via /api/media (prepare -> PUT R2 -> finalize)
 * Compatible avec les 2 signatures :
 *  uploadExternalMedia(file, "posts")
 *  uploadExternalMedia(file, { folder: "theme", maxBytes: ..., onProgress: (pct) => {} })
 *
 * onProgress reçoit 0..100 pendant l'envoi vers R2 (progression réelle, octet par octet).
 */

const PUT_RETRIES = 3;

// Dans l'APK (https://localhost), "/api/..." ne pointe pas vers Vercel :
// on utilise donc une URL absolue en natif. Sur le web, rien ne change.
function mediaApiUrl() {
  const base = Capacitor.isNativePlatform()
    ? import.meta.env.VITE_API_BASE_URL || "https://baaro-xi.vercel.app"
    : "";
  return `${base}/api/media`;
}

async function callMediaApi(payload, token) {
  const res = await fetch(mediaApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Réponse serveur invalide (${res.status}) : ${raw.slice(0, 80)}`
    );
  }
  return data;
}

// PUT avec XHR : fournit la progression réelle (fetch ne la donne pas).
function putFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.floor((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const error = new Error(`PUT R2 failed ${xhr.status}`);
      error.status = xhr.status;
      // 403 : lien signé expiré ou refusé, inutile de réessayer avec le même lien.
      error.fatal = xhr.status >= 400 && xhr.status < 500;
      reject(error);
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'envoi"));
    xhr.ontimeout = () => reject(new Error("Délai dépassé pendant l'envoi"));
    xhr.onabort = () => {
      const error = new Error("Envoi annulé");
      error.fatal = true;
      reject(error);
    };

    xhr.send(file);
  });
}

async function putFileWithRetry(url, file, onProgress) {
  let lastError;
  for (let attempt = 1; attempt <= PUT_RETRIES; attempt += 1) {
    try {
      onProgress?.(0);
      return await putFile(url, file, onProgress);
    } catch (error) {
      lastError = error;
      if (error.fatal) break;
      if (attempt < PUT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

export async function uploadExternalMedia(file, folderOrOptions = "posts") {
  let folder = "posts";
  let onProgress = null;
  if (typeof folderOrOptions === "string") {
    folder = folderOrOptions;
  } else if (folderOrOptions && typeof folderOrOptions === "object") {
    folder = folderOrOptions.folder || "posts";
    onProgress =
      typeof folderOrOptions.onProgress === "function"
        ? folderOrOptions.onProgress
        : null;
  }
  const ext = file.name?.split(".").pop() || "bin";
  const size = file.size;
  const contentType = file.type || "application/octet-stream";
  const fileName = file.name || "upload";

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 1. Étape "prepare" AVEC le token d'authentification
  const prep = await callMediaApi(
    { action: "prepare", folder, extension: ext, size, contentType, fileName },
    token
  );
  if (!prep.ok) throw new Error(prep.error || "prepare failed");
  const { uploadUrl, path, publicUrl } = prep;

  // 2. Envoi direct sur R2 (pas d'en-tête d'authentification ici, l'URL signée suffit)
  await putFileWithRetry(uploadUrl, file, onProgress);
  onProgress?.(100);

  // 3. Étape "finalize" AVEC le token d'authentification
  const fin = await callMediaApi(
    { action: "finalize", folder, path, publicUrl, size, contentType, fileName },
    token
  );
  if (!fin.ok) throw new Error(fin.error || "finalize failed");

  const asset = fin.asset || {};
  return {
    ...asset,
    url: asset.public_url || publicUrl,
    public_url: asset.public_url || publicUrl,
    publicUrl: asset.public_url || publicUrl,
    path: asset.object_key || path,
    object_key: asset.object_key || path,
  };
}

/**
 * Media URL helpers for BAARO.
 * Binary media is served from Cloudflare R2. Supabase Storage is not used.
 * (Repris tels quels du fichier collé : si ils sont déjà dans un autre fichier, tu peux les retirer ici.)
 */

function cleanUrl(url) {
  return typeof url === "string" && url.trim() ? url.trim() : url;
}

export function thumbUrl(url) {
  return cleanUrl(url);
}

export function avatarUrl(url) {
  return cleanUrl(url);
}

export function feedImageUrl(url) {
  return cleanUrl(url);
}

export function fullImageUrl(url) {
  return cleanUrl(url);
}
