/**
 * Cache local léger des profils publics.
 *
 * IMPORTANT :
 * `id` = auth.users.id (UUID) uniquement.
 * Jamais email / handle / device id comme clé.
 */

const CACHE_KEY = "baaro:users-cache";
const MAX_USERS = 100;

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(id) {
  if (!id || typeof id !== "string") return false;
  if (id.startsWith("@") || (id.includes("@") && id.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function normalizeUser(user) {
  if (!user || !isValidAuthUserId(user.id)) return null;

  const points = Number(user.points);

  return {
    id: user.id,
    display_name: (user.display_name || "Membre BAARO").trim(),
    handle: (user.handle || "@utilisateur").trim(),
    flag: user.flag || "🌍",
    country: user.country || "🌍",
    avatar_url: user.avatar_url || user.avatar || "",
    bio: (user.bio || "").trim(),
    points: Number.isFinite(points) ? points : 0,
    is_verified: Boolean(user.is_verified ?? user.isVerified),
  };
}

export function getCachedUsers() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUser).filter(Boolean);
  } catch {
    return [];
  }
}

export function setCachedUsers(users = []) {
  if (typeof window === "undefined" || !Array.isArray(users)) return;
  try {
    const uniqueUsers = new Map();
    for (const user of users.map(normalizeUser).filter(Boolean)) {
      uniqueUsers.set(user.id, user);
    }
    const limitedUsers = Array.from(uniqueUsers.values()).slice(0, MAX_USERS);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(limitedUsers));
  } catch {
    /* cache non bloquant */
  }
}

export function mergeCachedUsers(users = []) {
  if (typeof window === "undefined" || !Array.isArray(users)) return getCachedUsers();
  try {
    const existing = getCachedUsers();
    const map = new Map(existing.map((u) => [u.id, u]));
    for (const user of users.map(normalizeUser).filter(Boolean)) {
      map.set(user.id, { ...map.get(user.id), ...user });
    }
    const merged = Array.from(map.values()).slice(0, MAX_USERS);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return getCachedUsers();
  }
}

export function getCachedUserById(id) {
  if (!isValidAuthUserId(id)) return null;
  return getCachedUsers().find((u) => u.id === id) || null;
}

export function clearUsersCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {}
}
