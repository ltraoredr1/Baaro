
/**
 * BAARO — Préférences de notifications push
 *
 * Règles :
 * - Une erreur Supabase bloque les envois.
 * - Une absence de préférences utilise les valeurs par défaut.
 * - Les notifications marketing sont désactivées par défaut.
 * - Les préférences individuelles sont toujours respectées.
 */

const CATEGORY_COLUMNS = Object.freeze({
  message: "messages",
  messages: "messages",
  social: "social",
  live: "live",
  earnings: "earnings",
  wallet: "earnings",
  marketing: "marketing",
});

const DEFAULT_PREFERENCES = Object.freeze({
  messages: true,
  social: true,
  live: true,
  earnings: true,
  marketing: false,
});

function normalizeUserIds(userIds) {
  if (!Array.isArray(userIds)) return [];

  return [
    ...new Set(
      userIds.filter(
        (id) => typeof id === "string" && id.trim().length > 0
      )
    ),
  ];
}

/**
 * Charge les préférences des utilisateurs.
 *
 * Retour :
 * {
 *   preferences: Map<userId, preferenceRow>,
 *   error: null | Error
 * }
 */
export async function loadPrefs(admin, userIds) {
  const preferences = new Map();
  const ids = normalizeUserIds(userIds);

  if (!admin || typeof admin.from !== "function") {
    return {
      preferences,
      error: new Error("Client Supabase admin invalide."),
    };
  }

  if (!ids.length) {
    return { preferences, error: null };
  }

  try {
    const { data, error } = await admin
      .from("notification_preferences")
      .select("*")
      .in("user_id", ids);

    if (error) {
      return { preferences, error };
    }

    for (const row of Array.isArray(data) ? data : []) {
      if (
        row &&
        typeof row.user_id === "string" &&
        ids.includes(row.user_id)
      ) {
        preferences.set(row.user_id, row);
      }
    }

    return { preferences, error: null };
  } catch (error) {
    return {
      preferences: new Map(),
      error,
    };
  }
}

/**
 * Sélectionne les appareils autorisés à recevoir une notification.
 *
 * Une erreur de lecture des préférences bloque volontairement
 * tous les envois : aucun contournement en cas de panne Supabase.
 */
export function selectNotificationTargets({
  userIds,
  prefsResult,
  tokensByUser,
  category,
} = {}) {
  const ids = normalizeUserIds(userIds);
  const targets = [];

  if (!ids.length) {
    return {
      targets,
      skipped: 0,
      error: prefsResult?.error || null,
    };
  }

  if (prefsResult?.error) {
    return {
      targets: [],
      skipped: ids.length,
      error: prefsResult.error,
    };
  }

  const preferences =
    prefsResult?.preferences instanceof Map
      ? prefsResult.preferences
      : new Map();

  const column = CATEGORY_COLUMNS[String(category || "").toLowerCase()];

  // Une catégorie inconnue est bloquée par sécurité.
  if (!column) {
    return {
      targets: [],
      skipped: ids.length,
      error: new Error("Catégorie de notification inconnue."),
    };
  }

  let skipped = 0;

  for (const userId of ids) {
    const preference = preferences.get(userId);
    const defaultValue = DEFAULT_PREFERENCES[column];

    // Marketing nécessite toujours un opt-in explicite.
    const enabled =
      preference && Object.prototype.hasOwnProperty.call(preference, column)
        ? preference[column] === true
        : defaultValue;

    if (!enabled) {
      skipped += 1;
      continue;
    }

    const userTokens = tokensByUser instanceof Map
      ? tokensByUser.get(userId)
      : null;

    if (!Array.isArray(userTokens) || userTokens.length === 0) {
      skipped += 1;
      continue;
    }

    for (const token of userTokens) {
      if (
        token &&
        token.user_id === userId &&
        typeof token.token === "string" &&
        token.token.trim().length > 0
      ) {
        targets.push(token);
      }
    }
  }

  return {
    targets,
    skipped,
    error: null,
  };
}
