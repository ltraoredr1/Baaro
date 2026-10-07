import { uploadExternalMedia } from "../lib/externalMedia.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo après compression
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
  if (!ctx) return file;

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

export async function uploadShopMedia(
  file,
  { folder = "products", user_id } = {}
) {
  if (!file) throw new Error("Fichier manquant");
  if (!user_id) throw new Error("user_id requis");

  if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
    throw new Error("Format non supporté (JPEG, PNG, WebP, GIF)");
  }

  if (file.size > MAX_SIZE * 2) {
    throw new Error("Image trop lourde (max ~5 Mo après compression)");
  }

  const compressed = await compressImage(file);

  if (compressed.size > MAX_SIZE) {
    throw new Error("Image trop lourde même après compression");
  }

  const result = await uploadExternalMedia(compressed, {
    folder: "shop",
    user_id,
    maxBytes: MAX_SIZE,
  });

  return result.url;
}

/**
 * La suppression R2 doit être effectuée côté serveur/Worker.
 * Aucun secret R2 n'est exposé dans l'application cliente.
 */
export async function deleteShopMedia() {
  return;
}
