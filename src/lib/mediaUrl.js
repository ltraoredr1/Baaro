/**
 * URLs médias optimisées (Supabase Image Transform).
 * Place : src/lib/mediaUrl.js
 *
 * Si Image Transformations n'est pas activé sur le projet Supabase,
 * l'URL d'origine est renvoyée (pas d'erreur).
 */

/**
 * @param {string|null|undefined} url
 * @param {{ width?: number, height?: number, quality?: number, resize?: 'contain'|'cover'|'fill' }} opts
 * @returns {string|null|undefined}
 */
export function thumbUrl(
  url,
  { width = 800, height, quality = 75, resize = "contain" } = {}
) {
  if (!url || typeof url !== "string") return url;

  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;

  const base = url.replace(marker, "/storage/v1/render/image/public/");
  const params = new URLSearchParams();
  params.set("width", String(width));
  if (height != null) params.set("height", String(height));
  params.set("quality", String(quality));
  params.set("resize", resize);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}`;
}

/** Avatar (header, liste). */
export function avatarUrl(url, size = 96) {
  return thumbUrl(url, {
    width: size,
    height: size,
    quality: 70,
    resize: "cover",
  });
}

/** Image de post / produit dans le fil. */
export function feedImageUrl(url) {
  return thumbUrl(url, { width: 720, quality: 75, resize: "contain" });
}

/** Image détail / plein écran. */
export function fullImageUrl(url) {
  return thumbUrl(url, { width: 1200, quality: 80, resize: "contain" });
}
