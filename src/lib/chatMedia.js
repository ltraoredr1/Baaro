/**
 * Upload et utilitaires médias de chat via Cloudflare R2 et l’API BAARO.
 * Place : src/lib/chatMedia.js
 */
import { uploadExternalMedia } from "./externalMedia.js";

const MAX_CHAT_BYTES = 50 * 1024 * 1024; // 50 Mo

/**
 * Convertit un MIME type en type de message BAARO.
 * @param {string|null|undefined} mime
 * @returns {"image"|"video"|"audio"|"voice"|"file"}
 */
export function mimeToMessageType(mime) {
  if (!mime || typeof mime !== "string") return "file";
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

/**
 * Format mm:ss à partir d'une durée en secondes.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Meilleur MIME audio supporté par MediaRecorder dans ce navigateur.
 * @returns {string}
 */
export function getBestAudioMime() {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return "audio/webm";
}

/**
 * Upload d'un fichier de chat (image, vidéo, audio, document…).
 *
 * @param {File} file
 * @param {string} userId - auth.users.id
 * @returns {Promise<{
 *   url: string,
 *   provider: string,
 *   path?: string,
 *   mime?: string,
 *   size?: number,
 *   fileName?: string
 * }>}
 */
export async function uploadChatFile(file, userId) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId || typeof userId !== "string") {
    throw new Error("Utilisateur non connecté");
  }

  const result = await uploadExternalMedia(file, {
    folder: "chat",
    userId,
    maxBytes: MAX_CHAT_BYTES,
  });

  return {
    url: result.url,
    provider: result.provider || "cloudflare-r2",
    path: result.path ?? "",
    mime: result.mime ?? file.type ?? "application/octet-stream",
    size: result.size ?? file.size,
    fileName: result.fileName ?? file.name,
  };
}

/**
 * Upload d'un message vocal (Blob MediaRecorder).
 *
 * @param {Blob} blob
 * @param {string} userId
 * @param {number} [durationSeconds=0]
 * @returns {Promise<{
 *   url: string,
 *   provider: string,
 *   path?: string,
 *   mime: string,
 *   size: number,
 *   fileName: string,
 *   duration: number
 * }>}
 */
export async function uploadVoiceBlob(blob, userId, durationSeconds = 0) {
  if (!blob) throw new Error("Enregistrement vocal manquant");
  if (!userId || typeof userId !== "string") {
    throw new Error("Utilisateur non connecté");
  }

  const mime = blob.type || getBestAudioMime();
  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("mpeg") || mime.includes("mp3")
        ? "mp3"
        : "webm";

  const file = new File([blob], `voice-${Date.now()}.${ext}`, {
    type: mime,
  });

  const result = await uploadChatFile(file, userId);

  return {
    ...result,
    mime: result.mime || mime,
    duration: Math.max(0, Math.floor(Number(durationSeconds) || 0)),
  };
}

/**
 * URL affichable pour un média de chat.
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
export function getReadableUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url;
}
