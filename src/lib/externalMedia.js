import { Capacitor } from "@capacitor/core";
import { supabase } from "../supabaseClient.js";

/**
 * Upload média vers R2 via /api/media (prepare -> PUT R2 -> finalize)
 * Compatible avec les 2 signatures :
 *  uploadExternalMedia(file, "posts")
 *  uploadExternalMedia(file, {
 *    folder: "theme", onProgress: (pct) => {},
 *    compress: true,        // images : réduites avant l'envoi (défaut true)
 *    maxImageSide: 1280,    // côté max en pixels (ex. 512 pour un avatar)
 *    imageQuality: 0.8,
 *  })
 */

const PUT_RETRIES = 3;

// Réglages de compression des images
const DEFAULT_MAX_SIDE = 1280;
const DEFAULT_QUALITY = 0.8;
const SKIP_COMPRESS_UNDER = 150 * 1024; // en dessous : on n'y touche pas

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

/**
 * Réduit une image avant l'envoi : redimensionne et recompresse (WebP, sinon JPEG).
 * Ne touche pas aux GIF/SVG, ni aux petits fichiers, et garde l'original
 * si le résultat n'est pas plus léger. En cas d'erreur, renvoie l'original.
 */
async function compressImage(
  file,
  { maxSide = DEFAULT_MAX_SIDE, quality = DEFAULT_QUALITY } = {}
) {
  try {
    if (!file?.type?.startsWith("image/")) return file;
    if (/gif|svg/i.test(file.type)) return file;
    if (file.size < SKIP_COMPRESS_UNDER) return file;

    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const toBlob = (type) =>
      new Promise((resolve) => canvas.toBlob(resolve, type, quality));

    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob || blob.size >= file.size) return file;

    const base = (file.name || "image").replace(/\.[^.]+$/, "");
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch (error) {
    console.warn("[BAARO] Compression image ignorée :", error);
    return file;
  }
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

export async function uploadExternalMedia(inputFile, folderOrOptions = "posts") {
  let folder = "posts";
  let onProgress = null;
  let compress = true;
  let maxImageSide = DEFAULT_MAX_SIDE;
  let imageQuality = DEFAULT_QUALITY;

  if (typeof folderOrOptions === "string") {
    folder = folderOrOptions;
  } else if (folderOrOptions && typeof folderOrOptions === "object") {
    folder = folderOrOptions.folder || "posts";
    onProgress =
      typeof folderOrOptions.onProgress === "function"
        ? folderOrOptions.onProgress
        : null;
    if (folderOrOptions.compress === false) compress = false;
    if (folderOrOptions.maxImageSide) maxImageSide = folderOrOptions.maxImageSide;
    if (folderOrOptions.imageQuality) imageQuality = folderOrOptions.imageQuality;
  }

  // Réduit les images AVANT l'envoi : moins de données montantes et descendantes
  const file = compress
    ? await compressImage(inputFile, { maxSide: maxImageSide, quality: imageQuality })
    : inputFile;

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
 *
 * Redimensionnement à la volée (optionnel) : mets VITE_IMAGE_RESIZE=1 si ton
 * domaine R2 est un domaine personnalisé Cloudflare avec les « Transformations »
 * d'images activées. Sinon les URL restent inchangées.
 */

const RESIZE_ENABLED = import.meta.env.VITE_IMAGE_RESIZE === "1";

function cleanUrl(url) {
  return typeof url === "string" && url.trim() ? url.trim() : url;
}

function resized(url, width, quality = 75) {
  const clean = cleanUrl(url);
  if (!RESIZE_ENABLED || typeof clean !== "string") return clean;
  if (!/^https?:\/\//i.test(clean)) return clean;
  if (/\.(gif|svg|mp4|webm|mov|m4v)(\?|#|$)/i.test(clean)) return clean;
  try {
    const { origin, pathname, search } = new URL(clean);
    return `${origin}/cdn-cgi/image/width=${width},quality=${quality},format=auto${pathname}${search}`;
  } catch {
    return clean;
  }
}

export function thumbUrl(url) {
  return resized(url, 400);
}

export function avatarUrl(url) {
  return resized(url, 160);
}

export function feedImageUrl(url) {
  return resized(url, 800);
}

export function fullImageUrl(url) {
  return resized(url, 1600, 80);
}
