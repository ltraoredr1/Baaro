/**
 * Cache local léger des profils publics.
 * Impeccable: UUID-only, LRU, TTL 7 jours, non-bloquant
 */

const CACHE_KEY = "baaro:users-cache-v2";
const MAX_USERS = 120;
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(id) {
  if (!id || typeof id!== "string") return false;
  if (id.startsWith("@") || (id.includes("@") && id.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function normalizeUser(user, existing = null) {
  if (!user ||!isValidAuthUserId(user.id)) return null;

  const points = Number(user.points);
  const now = Date.now();

  return {
    id: user.id,
    display_name: (user.display_name || existing?.display_name || "Membre BAARO").trim().slice(0, 80),
    handle: (user.handle || existing?.handle || "@utilisateur").trim().slice(0, 30),
    flag: user.flag || existing?.flag || "🌍",
    country: user.country || existing?.country || "🌍",
    avatar_url: (user.avatar_url || user.avatar || existing?.avatar_url || "").trim(),
    bio: (user.bio || existing?.bio || "").trim().slice(0, 200),
    points: Number.isFinite(points)? points : existing?.points || 0,
    is_verified: Boolean(user.is_verified?? user.isVerified?? existing?.is_verified?? false),
    _cachedAt: now,
    _lastAccess: now,
  };
}

function isExpired(entry) {
  if (!entry?._cachedAt) return false;
  return Date.now() - entry._cachedAt > TTL_MS;
}

function readRaw() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(users) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(users));
  } catch (e) {
    // Quota exceeded: coupe en 2 et retry
    if (e?.name === "QuotaExceededError" && users.length > 20) {
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(users.slice(0, 50)));
      } catch {}
    }
  }
}

export function getCachedUsers({ includeExpired = false } = {}) {
  const raw = readRaw();
  const valid = [];
  for (const u of raw) {
    const norm = normalizeUser(u);
    if (!norm) continue;
    if (!includeExpired && isExpired(norm)) continue;
    valid.push(norm);
  }
  // Tri LRU: plus récent en premier
  valid.sort((a, b) => (b._lastAccess || 0) - (a._lastAccess || 0));
  return valid;
}

export function setCachedUsers(users = []) {
  if (typeof window === "undefined" ||!Array.isArray(users)) return;
  const map = new Map();
  for (const user of users) {
    const norm = normalizeUser(user);
    if (norm) map.set(norm.id, norm);
  }
  const limited = Array.from(map.values())
   .sort((a, b) => b._lastAccess - a._lastAccess)
   .slice(0, MAX_USERS);
  writeRaw(limited);
}

export function mergeCachedUsers(users = []) {
  if (typeof window === "undefined" ||!Array.isArray(users)) return getCachedUsers();
  try {
    const existing = getCachedUsers({ includeExpired: true });
    const map = new Map(existing.map((u) => [u.id, u]));

    for (const user of users) {
      const existingUser = map.get(user.id);
      const norm = normalizeUser(user, existingUser);
      if (norm) {
        // Garde _cachedAt original si pas expiré
        if (existingUser &&!isExpired(existingUser)) {
          norm._cachedAt = existingUser._cachedAt;
        }
        map.set(norm.id, norm);
      }
    }

    // Nettoie expirés + LRU
    const merged = Array.from(map.values())
     .filter((u) =>!isExpired(u))
     .sort((a, b) => (b._lastAccess || 0) - (a._lastAccess || 0))
     .slice(0, MAX_USERS);

    writeRaw(merged);
    return merged;
  } catch {
    return getCachedUsers();
  }
}

export function getCachedUserById(id) {
  if (!isValidAuthUserId(id)) return null;
  const users = getCachedUsers();
  const found = users.find((u) => u.id === id) || null;
  if (found) {
    // Touch LRU
    found._lastAccess = Date.now();
    // Update silencieux sans boucle infinie
    try {
      const all = getCachedUsers({ includeExpired: true });
      const idx = all.findIndex((u) => u.id === id);
      if (idx >= 0) {
        all[idx] = found;
        writeRaw(all);
      }
    } catch {}
  }
  return found;
}

export function clearUsersCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
    // Nettoie ancienne clé v1 aussi
    window.localStorage.removeItem("baaro:users-cache");
  } catch {}
}

// Nettoyage auto au boot (1 fois / jour)
export function pruneExpiredCache() {
  if (typeof window === "undefined") return;
  const lastPrune = Number(localStorage.getItem("baaro:users-cache-prune") || 0);
  if (Date.now() - lastPrune < 1000 * 60 * 60 * 24) return;
  try {
    const cleaned = getCachedUsers(); // filtre expirés
    writeRaw(cleaned);
    localStorage.setItem("baaro:users-cache-prune", String(Date.now()));
  } catch {}
}

try { pruneExpiredCache(); } catch {}
