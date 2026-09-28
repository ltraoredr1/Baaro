// src/lib/chatMedia.js
// Nouveaux fichiers/messages vocaux -> Telegram.
// Les anciennes URLs Supabase restent lisibles si elles sont déjà enregistrées.

import { uploadExternalMedia } from "./externalMedia.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // limite Telegram du service BAARO
const MAX_VOICE_DURATION = 180;

export async function getReadableUrl(pathOrUrl) {
  if (!pathOrUrl) return null;

  // Les nouveaux médias Telegram sont déjà des URLs BAARO signées/proxy.
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://")
  ) {
    return pathOrUrl;
  }

  // Pour les anciens messages, conserver la compatibilité avec les
  // chemins historiques sans créer de nouveaux uploads Supabase.
  return null;
}

export async function uploadChatFile(file, userId) {
  if (!file) throw new Error("Aucun fichier");
  if (!userId) throw new Error("Utilisateur non connecté");

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Fichier trop volumineux (max 50 Mo)");
  }

  return uploadExternalMedia(file, {
    folder: "chat",
    userId,
    maxBytes: MAX_FILE_SIZE,
  });
}

export function getBestAudioMime() {
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }

  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch (_) {}
  }

  return "audio/webm";
}

function extFromMime(mime) {
  if (!mime) return "webm";
  if (
    mime.includes("mp4") ||
    mime.includes("aac") ||
    mime.includes("m4a")
  ) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

export async function uploadVoiceBlob(
  blob,
  userId,
  durationSeconds = 0
) {
  if (!blob) throw new Error("Aucun enregistrement");

  if (durationSeconds > MAX_VOICE_DURATION) {
    throw new Error(
      `Message vocal trop long (max ${MAX_VOICE_DURATION}s)`
    );
  }

  const mime = blob.type || getBestAudioMime();
  const ext = extFromMime(mime);

  const file = new File(
    [blob],
    `voice_${Date.now()}.${ext}`,
    { type: mime }
  );

  const result = await uploadChatFile(file, userId);

  return {
    ...result,
    duration: Math.round(durationSeconds || 0),
  };
}

export function mimeToMessageType(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "voice";
  return "file";
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
