/**
 * Upload avatar / couverture
 * Chemin Storage : {auth.users.id}/{avatar|cover}/current.webp
 */
import { supabase } from "../supabaseClient.js";

const BUCKET = "profile-media";
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function compressImage(file, { maxWidth = 1600, quality = 0.82 } = {}) {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
  if (!blob) return file;
  return new File([blob], "current.webp", { type: "image/webp" });
}

/**
 * @param {File} file
 * @param {{ userId: string, kind: 'avatar' | 'cover' }} opts
 *   userId DOIT être auth.users.id (UUID), jamais un handle
 */
export async function uploadProfileMedia(file, { userId, kind = "avatar" }) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId || typeof userId !== "string") {
    throw new Error("userId requis (auth.users.id)");
  }
  // Garde-fou : refuser un handle (@xxx) ou un e-mail comme "identité"
  if (userId.startsWith("@") || userId.includes("@") || userId.length < 32) {
    throw new Error("Identité invalide : utiliser auth.users.id uniquement");
  }
  if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
    throw new Error("Formats acceptés : JPEG, PNG, WebP, GIF");
  }
  if (file.size > MAX_SIZE * 3) throw new Error("Image trop lourde");

  const maxWidth = kind === "cover" ? 1800 : 800;
  const compressed = await compressImage(file, {
    maxWidth,
    quality: kind === "cover" ? 0.8 : 0.85,
  });
  if (compressed.size > MAX_SIZE) {
    throw new Error("Image trop lourde après compression (max 5 Mo)");
  }

  // Identité technique dans le path Storage
  const path = `\( {userId}/ \){kind}/current.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: "31536000",
    upsert: true,
    contentType: "image/webp",
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const base = data.publicUrl.split("?")[0];
  return `\( {base}?v= \){Date.now()}`;
}
