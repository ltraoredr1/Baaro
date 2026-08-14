// src/lib/chatMedia.js
// Upload fichiers / messages vocaux vers Supabase Storage (bucket chat-media)

import { supabase } from "../supabaseClient.js";

const BUCKET = "chat-media";
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80 Mo
const MAX_VOICE_DURATION = 180; // 3 minutes

/**
 * Upload un fichier (image, vidéo, doc, audio…)
 * @returns {Promise<{ url: string, path: string, mime: string, size: number, fileName: string }>}
 */
export async function uploadChatFile(file, userId, onProgress) {
  if (!file) throw new Error("Aucun fichier");
  if (!userId) throw new Error("Utilisateur non connecté");
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Fichier trop volumineux (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo)`);
  }

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || "bin"}`;
  const path = `${userId}/${safeName}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) throw error;

  // URL publique (si bucket public) ou signed (si privé)
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  let url = pub?.publicUrl;

  // Si bucket privé, générer une signed URL longue (7 jours)
  if (!url || url.includes("undefined")) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60 * 60 * 24 * 7);
    if (signErr) throw signErr;
    url = signed.signedUrl;
  }

  if (typeof onProgress === "function") onProgress(100);

  return {
    url,
    path: data.path,
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name,
  };
}

/**
 * Upload d'un Blob audio (message vocal)
 */
export async function uploadVoiceBlob(blob, userId, durationSeconds = 0) {
  if (!blob) throw new Error("Aucun enregistrement");
  if (durationSeconds > MAX_VOICE_DURATION) {
    throw new Error(`Message vocal trop long (max ${MAX_VOICE_DURATION}s)`);
  }

  const file = new File(
    [blob],
    `voice_${Date.now()}.webm`,
    { type: blob.type || "audio/webm" }
  );

  const result = await uploadChatFile(file, userId);
  return {
    ...result,
    duration: Math.round(durationSeconds || 0),
  };
}

/**
 * Détermine le type de message à partir du MIME
 */
export function mimeToMessageType(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Format taille lisible
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Format durée mm:ss
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
