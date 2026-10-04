/**
 * Media URL helpers for BAARO.
 * Binary media is served from Cloudflare R2. Supabase Storage is not used.
 */

function cleanUrl(url) {
  return typeof url === "string" && url.trim() ? url.trim() : url;
}

export function thumbUrl(url) {
  return cleanUrl(url);
}

export function avatarUrl(url) {
  return cleanUrl(url);
}

export function feedImageUrl(url) {
  return cleanUrl(url);
}

export function fullImageUrl(url) {
  return cleanUrl(url);
}
