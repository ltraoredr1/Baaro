import { supabase } from "../supabaseClient.js";
/**
 * Upload média vers R2 via /api/media
 * Compatible avec les 2 signatures :
 *  uploadExternalMedia(file, "posts")
 *  uploadExternalMedia(file, { folder: "theme", maxBytes: ... })
 */
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
  const prepRes = await fetch("/api/media", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      ...(token ? { Authorization: `Bearer ${token}` } : {}) 
    },
    body: JSON.stringify({ action: "prepare", folder, extension: ext, size, contentType, fileName }),
  });
  const prep = await prepRes.json();
  if (!prep.ok) throw new Error(prep.error || "prepare failed");
  const { uploadUrl, path, publicUrl } = prep;

  // 2. Envoi direct sur R2 (pas d'en-tête d'authentification ici, l'URL signée suffit)
  const putRes = await fetch(uploadUrl, { method: "PUT", body: file });
  if (!putRes.ok) throw new Error(`PUT R2 failed ${putRes.status}`);

  // 3. Étape "finalize" AVEC le token d'authentification
  const finRes = await fetch("/api/media", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      ...(token ? { Authorization: `Bearer ${token}` } : {}) 
    },
    body: JSON.stringify({ action: "finalize", folder, path, publicUrl, size, contentType, fileName }),
  });
  const fin = await finRes.json();
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
