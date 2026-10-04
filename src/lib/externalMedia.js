import { supabase } from "../supabaseClient.js";
import { API_BASE } from "../config.js";

const MAX_DEFAULT = 100 * 1024 * 1024;

function apiUrl(path) {
  const base = API_BASE || "";
  return `${base}${path}`;
}

function extFromFile(file) {
  const name = String(file?.name || "");
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const mime = String(file?.type || "");
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm",
    "video/quicktime": "mov", "audio/webm": "webm", "audio/ogg": "ogg",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf"
  };
  return map[mime] || "bin";
}

export async function uploadExternalMedia(file, {
  folder = "misc",
  userId,
  maxBytes = MAX_DEFAULT,
} = {}) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId) throw new Error("Utilisateur non authentifié");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Fichier invalide");
  if (file.size > maxBytes) throw new Error(`Fichier trop volumineux (max ${Math.ceil(maxBytes / 1024 / 1024)} Mo)`);

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Session expirée");

  const safeFolder = String(folder).replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "misc";
  const ext = extFromFile(file);
  const prepare = await fetch(apiUrl("/api/media"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "prepare",
      folder: safeFolder,
      extension: ext,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      fileName: file.name || "upload",
    }),
  });

  const prepared = await prepare.json().catch(() => ({}));
  if (!prepare.ok || !prepared?.ok || !prepared?.uploadUrl) {
    throw new Error(prepared?.error || "Impossible de préparer l'upload média");
  }

  const upload = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!upload.ok) {
    throw new Error(`Échec upload média (${upload.status})`);
  }

  const finalize = await fetch(apiUrl("/api/media"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "finalize",
      folder: safeFolder,
      path: prepared.path,
      publicUrl: prepared.publicUrl,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      fileName: file.name || "upload",
    }),
  });
  const finalized = await finalize.json().catch(() => ({}));
  if (!finalize.ok || !finalized?.ok) {
    throw new Error(finalized?.error || "Impossible d'enregistrer les métadonnées du média");
  }

  return {
    url: prepared.publicUrl,
    path: prepared.path,
    provider: "cloudflare-r2",
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name || "upload",
  };
}
