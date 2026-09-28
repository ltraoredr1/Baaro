/**
 * Upload et gestion des médias de chat (Telegram via API BAARO).
 * Place : src/lib/chatMedia.js
 */
import { uploadExternalMedia } from "./externalMedia.js";

const MAX_CHAT_BYTES = 50 * 1024 * 1024; // 50 Mo

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
    provider: "telegram",
    path: result.path ?? "",
    mime: result.mime ?? file.type ?? "application/octet-stream",
    size: result.size ?? file.size,
    fileName: result.fileName ?? file.name,
  };
}

/**
 * Retourne une URL affichable pour un média de chat.
 * (Pas de transformation pour l’instant — les URLs Telegram sont déjà publiques.)
 *
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
export function getReadableUrl(url) {
  if (!url || typeof url !== "string") return url;
  return url;
}
