import { uploadExternalMedia } from "../lib/externalMedia.js";
import { compressImage } from "../lib/imageCompress.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo après compression
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Ré-export pour les appelants qui importaient compressImage depuis ce module. */
export { compressImage };

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

  const compressed = await compressImage(file, {
    maxWidth: 1200,
    quality: 0.8,
  });

  if (compressed.size > MAX_SIZE) {
    throw new Error("Image trop lourde même après compression");
  }

  const result = await uploadExternalMedia(compressed, {
    folder: "shop",
    user_id,
    maxBytes: MAX_SIZE,
    // déjà compressé ici
    compress: false,
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
