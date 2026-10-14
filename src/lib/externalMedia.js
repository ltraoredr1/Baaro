import { Capacitor } from "@capacitor/core";
import { supabase } from "../supabaseClient.js";

/**
 * Upload média vers R2 via /api/media (prepare -> PUT R2 -> finalize)
 * Compatible avec les 2 signatures :
 *  uploadExternalMedia(file, "posts")
 *  uploadExternalMedia(file, { folder: "theme", maxBytes: ... })
 */

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

export async function uploadExternalMedia(file, folderOrOptions = "posts") {
  let folder = "posts";
  if (typeof folderOrOptions === "string") {
    folder = folderOrOptions;
  } else if (folderOrOptions && typeof folderOrOptions === "object") {
    folder = folderOrOptions.folder || "posts";
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
  const putRes = await fetch(uploadUrl, { method: "PUT", body: file });
  if (!putRes.ok) throw new Error(`PUT R2 failed ${putRes.status}`);

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
