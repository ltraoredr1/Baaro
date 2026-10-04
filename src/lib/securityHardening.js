/** BAARO Security Hardening — client-side helpers. */

const DEVICE_STORAGE_KEY = "baaro-security-device-id";

function randomBytes(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getSecurityDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && /^[a-f0-9]{48}$/.test(existing)) return existing;
    const id = bytesToHex(randomBytes(24));
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
    return id;
  } catch {
    return bytesToHex(randomBytes(24));
  }
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function getDeviceFingerprint(publicKeyJwk) {
  return sha256Hex(JSON.stringify(publicKeyJwk || {}));
}

export function securityHeadersForFetch(extra = {}) {
  return {
    "X-BAARO-Device": getSecurityDeviceId(),
    "X-Requested-With": "BAARO",
    ...extra,
  };
}

export function validateExternalRedirect(value, allowedHosts = []) {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin) return true;
    return allowedHosts.includes(url.host);
  } catch {
    return false;
  }
}

export function redactSensitive(value) {
  if (!value || typeof value !== "object") return value;
  const blocked = /password|token|secret|authorization|cookie|private.?key|access.?key/i;
  if (Array.isArray(value)) return value.map(redactSensitive);
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      blocked.test(key) ? "[REDACTED]" : redactSensitive(val),
    ])
  );
}
