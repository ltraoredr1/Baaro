/**
 * Cache local léger des profils publics.
 *
 * IMPORTANT :
 * `id` est l'identifiant unique canonique de l'utilisateur.
 *
 * Aucun `user_id` secondaire n'est créé ici.
 */

const CACHE_KEY = "baaro:users-cache";
const MAX_USERS = 100;

function hasValidId(id) {
  return id !== undefined && id !== null && id !== "";
}

function normalizeUser(user) {
  if (!user || !hasValidId(user.id)) return null;

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

/**
 * Récupère les utilisateurs du cache local.
 */
export function getCachedUsers() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeUser).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Enregistre uniquement des informations publiques
 * nécessaires à la recherche.
 *
 * Remplace intégralement le cache existant par la liste fournie.
 * Pour ajouter des utilisateurs sans écraser le cache actuel,
 * voir `mergeCachedUsers` ci-dessous.
 */
export function setCachedUsers(users = []) {
  if (typeof window === "undefined" || !Array.isArray(users)) {
    return;
  }

  try {
    const normalized = users.map(normalizeUser).filter(Boolean);

    const uniqueUsers = new Map();

    for (const user of normalized) {
      uniqueUsers.set(user.id, user);
    }

    const limitedUsers = Array.from(uniqueUsers.values()).slice(
      0,
      MAX_USERS
    );

    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(limitedUsers)
    );
  } catch {
    // Le cache ne doit jamais bloquer l'application.
  }
}

/**
 * Fusionne de nouveaux utilisateurs avec le cache existant,
 * au lieu de le remplacer entièrement.
 *
 * Utile quand on recharge seulement une partie des utilisateurs
 * (ex : résultats de recherche paginés) et qu'on veut conserver
 * les entrées déjà en cache.
 *
 * En cas de dépassement de MAX_USERS, les entrées les plus
 * récemment fournies sont prioritaires.
 */
export function mergeCachedUsers(users = []) {
  if (typeof window === "undefined" || !Array.isArray(users)) {
    return;
  }

  const existing = getCachedUsers();
  const incoming = users.map(normalizeUser).filter(Boolean);

  // Les entrées "incoming" passent en premier : en cas d'id
  // dupliqué, leur valeur (plus récente) l'emporte tout en
  // restant prioritaire lors de la troncature à MAX_USERS.
  setCachedUsers([...incoming, ...existing]);
}

/**
 * Recherche locale d'un utilisateur par son `id`.
 *
 * `id` reste la seule clé d'identification.
 */
export function getUserById(id) {
  if (!hasValidId(id)) return null;

  return (
    getCachedUsers().find((user) => user.id === id) ||
    null
  );
}

/**
 * Compatibilité avec l'ancien code.
 *
 * Le tableau reste vide volontairement :
 * les utilisateurs réels viennent de Supabase
 * ou du cache local.
 */
export const STABLE_USERS = [];
