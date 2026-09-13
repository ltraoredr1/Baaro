/**
 * Upload avatar / couverture profil
 * Place : src/lib/profileMedia.js
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
  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
    type: "image/webp",
  });
}

/**
 * @param {File} file
 * @param {{ userId: string, kind: 'avatar' | 'cover' }} opts
 * @returns {Promise<string>} public URL
 */
export async function uploadProfileMedia(file, { userId, kind = "avatar" }) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId) throw new Error("Connexion requise");
  if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
    throw new Error("Formats acceptés : JPEG, PNG, WebP, GIF");
  }
  if (file.size > MAX_SIZE * 3) {
    throw new Error("Image trop lourde");
  }

  const maxWidth = kind === "cover" ? 1800 : 800;
  const compressed = await compressImage(file, { maxWidth, quality: kind === "cover" ? 0.8 : 0.85 });
  if (compressed.size > MAX_SIZE) {
    throw new Error("Image trop lourde après compression (max 5 Mo)");
  }

  const ext = compressed.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${kind}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: "3600",
    upsert: true,
    contentType: compressed.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
