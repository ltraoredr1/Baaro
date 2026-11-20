/**
 * Media URL helpers for BAARO.
 * Binary media is served from Cloudflare R2. Supabase Storage is not used.
 *
 * Les transformations Cloudflare sont activées uniquement avec
 * VITE_IMAGE_RESIZE=1 et un domaine compatible configuré côté Cloudflare.
 */

const RESIZE_ENABLED = import.meta.env.VITE_IMAGE_RESIZE === "1";

function cleanUrl(url) {
  return typeof url === "string" && url.trim() ? url.trim() : url;
}

function resized(url, width, quality = 75) {
  const clean = cleanUrl(url);
  if (!RESIZE_ENABLED || typeof clean !== "string") return clean;
  if (!/^https?:\/\//i.test(clean)) return clean;
  if (/\.(gif|svg|mp4|webm|mov|m4v)(\?|#|$)/i.test(clean)) return clean;

  try {
    const parsed = new URL(clean);
    return `${parsed.origin}/cdn-cgi/image/width=${width},quality=${quality},format=auto${parsed.pathname}${parsed.search}`;
  } catch {
    return clean;
  }
}

export function thumbUrl(url) {
  return resized(url, 400);
}

export function avatarUrl(url) {
  return resized(url, 160);
}

export function feedImageUrl(url) {
  return resized(url, 800);
}

export function fullImageUrl(url) {
  return resized(url, 1600, 80);
}
