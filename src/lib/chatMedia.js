// src/lib/chatMedia.js
// Upload fichiers / messages vocaux vers Supabase Storage (bucket chat-media)
// Version corrigée : signed URLs systématiques + formats audio mobiles

import { supabase } from "../supabaseClient.js";

const BUCKET = "chat-media";
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80 Mo
const MAX_VOICE_DURATION = 180; // 3 minutes
const SIGNED_TTL = 60 * 60 * 24 * 365; // 1 an, renouvelé à la lecture si nécessaire

/**
 * Obtient une URL lisible (signed si bucket privé, publique sinon)
 */
export async function getReadableUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  // Déjà une URL absolue
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  // C'est un path storage → signed URL
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOrUrl, SIGNED_TTL);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Upload un fichier (image, vidéo, doc, audio…)
 */
export async function uploadChatFile(file, userId) {
  if (!file) throw new Error("Aucun fichier");
  if (!userId) throw new Error("Utilisateur non connecté");
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `Fichier trop volumineux (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo)`
    );
  }

  const ext = (file.name.split(".").pop() || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const safeName = `${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}.${ext || "bin"}`;
  const path = `${userId}/${safeName}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) {
    console.error("Upload error:", error);
    throw new Error(error.message || "Échec upload (vérifie le bucket chat-media)");
  }

  // Toujours générer une signed URL (marche bucket public ET privé)
  let url;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.path, SIGNED_TTL);

  if (!signErr && signed?.signedUrl) {
    url = signed.signedUrl;
  } else {
    url = null;
  }

  if (!url) throw new Error("Impossible d'obtenir l'URL du fichier");

  return {
    url,
    path: data.path,
    mime: file.type || "application/octet-stream",
    size: file.size,
    fileName: file.name,
  };
}

/**
 * Choisit le meilleur MIME pour MediaRecorder (compatible mobile)
 */
export function getBestAudioMime() {
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (_) {}
  }
  return "audio/webm";
}

/**
 * Extension selon MIME
 */
function extFromMime(mime) {
  if (!mime) return "webm";
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * Upload d'un Blob audio (message vocal)
 */
export async function uploadVoiceBlob(blob, userId, durationSeconds = 0) {
  if (!blob) throw new Error("Aucun enregistrement");
  if (durationSeconds > MAX_VOICE_DURATION) {
    throw new Error(`Message vocal trop long (max ${MAX_VOICE_DURATION}s)`);
  }

  const mime = blob.type || getBestAudioMime();
  const ext = extFromMime(mime);
  const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mime });

  const result = await uploadChatFile(file, userId);
  return {
    ...result,
    duration: Math.round(durationSeconds || 0),
  };
}

export function mimeToMessageType(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice"; // les audios = voice pour l'UI
  return "file";
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
