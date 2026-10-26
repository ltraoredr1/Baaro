/**
 * BAARO — compression image unique (client)
 *
 * Utilisé par :
 *  - src/lib/externalMedia.js  (feed / posts / générique)
 *  - src/services/mediaUpload.js (shop)
 *  - src/lib/profileMedia.js   (avatar / couverture)
 *
 * Options :
 *  - maxSide   : côté max (largeur OU hauteur) — défaut 1280
 *  - maxWidth  : alias pratique (équivalent maxSide si fourni seul)
 *  - quality   : 0–1 — défaut 0.8
 *  - skipUnder : taille (octets) sous laquelle on ne compresse pas — défaut 150 Ko
 *  - preferName: nom de fichier de sortie (sinon dérivé de l'original)
 *
 * Comportement :
 *  - ignore non-images, GIF, SVG (animation / vecteur)
 *  - orientation EXIF respectée via createImageBitmap
 *  - WebP si supporté, sinon JPEG
 *  - conserve l'original si le résultat n'est pas plus léger
 *  - en cas d'erreur : renvoie le fichier d'origine
 */

export const DEFAULT_MAX_SIDE = 1280;
export const DEFAULT_QUALITY = 0.8;
export const SKIP_COMPRESS_UNDER = 150 * 1024;

/**
 * @param {File|Blob} file
 * @param {{ maxSide?: number, maxWidth?: number, quality?: number, skipUnder?: number, preferName?: string }} [options]
 * @returns {Promise<File|Blob>}
 */
export async function compressImage(file, options = {}) {
  if (!file) return file;

  const maxSide =
    options.maxSide ??
    options.maxWidth ??
    DEFAULT_MAX_SIDE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const skipUnder = options.skipUnder ?? SKIP_COMPRESS_UNDER;
  const preferName = options.preferName;

  try {
    const type = file.type || "";
    if (!type.startsWith("image/")) return file;
    if (/gif|svg/i.test(type)) return file;
    if (typeof file.size === "number" && file.size < skipUnder) return file;

    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const toBlob = (mime) =>
      new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob("image/jpeg");
    }
    if (!blob) return file;
    if (typeof file.size === "number" && blob.size >= file.size) return file;

    const base = preferName
      ? String(preferName).replace(/\.[^.]+$/, "")
      : (file.name || "image").replace(/\.[^.]+$/, "");
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch (error) {
    console.warn("[BAARO] Compression image ignorée :", error);
    return file;
  }
}
