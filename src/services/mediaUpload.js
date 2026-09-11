import { supabase } from "../../../supabaseClient.js";

const BUCKET = "shop-media";
const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Compresse une image côté client (canvas) avant upload.
 * Réduit poids + dimensions (max 1200px).
 */
export async function compressImage(file, { maxWidth = 1200, quality = 0.8 } = {}) {
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
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality)
  );

  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
    type: "image/webp",
  });
}

/**
 * Upload une image dans shop-media/{userId}/{folder}/{timestamp}.ext
 * Retourne l'URL publique.
 */
export async function uploadShopMedia(file, { folder = "products", userId } = {}) {
  if (!file) throw new Error("Fichier manquant");
  if (!userId) throw new Error("userId requis");

  if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
    throw new Error("Format non supporté (JPEG, PNG, WebP, GIF)");
  }
  if (file.size > MAX_SIZE * 2) {
    // avant compression
    throw new Error("Image trop lourde (max ~5 Mo après compression)");
  }

  const compressed = await compressImage(file);
  if (compressed.size > MAX_SIZE) {
    throw new Error("Image trop lourde même après compression");
  }

  const ext = compressed.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg");
  const path = `${userId}/${folder}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: "3600",
    upsert: false,
    contentType: compressed.type,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Supprime un média à partir de son URL publique (si elle appartient au bucket).
 */
export async function deleteShopMedia(publicUrl) {
  if (!publicUrl) return;
  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}
