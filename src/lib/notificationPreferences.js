import { callSocial } from "./notifyInteraction.js";

/**
 * Préférences push BAARO.
 * Catégorie "earnings" (gains créateur, tips, payouts, économie réelle XOF).
 *
 * Toutes les lectures / écritures serveur passent par /api/social
 * (actions "get_preferences" et "save_preferences"). Ce module ne touche
 * plus directement à la table notification_preferences.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  push_enabled: true,
  messages: true,
  social: true,
  live: true,
  earnings: true,
  marketing: false,
};

const LOCAL_KEY = "baaro:notif_prefs";

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const parsed = JSON.parse(raw);
    if ("wallet" in parsed && !("earnings" in parsed)) {
      parsed.earnings = parsed.wallet;
      delete parsed.wallet;
    }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

function saveLocal(prefs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export async function getNotificationPreferences() {
  try {
    const result = await callSocial("get_preferences");
    if (!result) {
      return { ok: true, data: loadLocal(), local: true };
    }

    if (!result.ok) {
      const message = result.body?.error || `HTTP ${result.status}`;
      console.error("getNotificationPreferences:", message);
      return { ok: true, data: loadLocal(), local: true, error: message };
    }

    const data = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...result.body.data };
    delete data.wallet;
    saveLocal(data);
    return { ok: true, data };
  } catch (e) {
    return { ok: true, data: loadLocal(), local: true, error: e.message };
  }
}

export async function saveNotificationPreferences(patch) {
  try {
    const safe = {};
    const keys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
    for (const key of keys) {
      if (key in patch) safe[key] = Boolean(patch[key]);
    }
    if ("wallet" in patch && !("earnings" in safe)) {
      safe.earnings = Boolean(patch.wallet);
    }
    if (Object.keys(safe).length === 0) {
      return { ok: false, error: "Aucune preference valide" };
    }

    const merged = { ...loadLocal(), ...safe };
    delete merged.wallet;
    saveLocal(merged);

    const result = await callSocial("save_preferences", { preferences: safe });
    if (!result) {
      return { ok: true, local: true };
    }

    if (!result.ok) {
      const message = result.body?.error || `HTTP ${result.status}`;
      console.error("saveNotificationPreferences:", message);
      return { ok: true, local: true, error: message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * @param {object} preferences
 * @param {"message"|"social"|"live"|"earnings"|"marketing"|string} category
 */
export function shouldNotify(preferences, category) {
  if (!preferences || !preferences.push_enabled) return false;
  switch (category) {
    case "message":
      return preferences.messages !== false;
    case "social":
      return preferences.social !== false;
    case "live":
      return preferences.live !== false;
    case "earnings":
    case "wallet":
      return preferences.earnings !== false;
    case "marketing":
      return preferences.marketing === true;
    default:
      return true;
  }
}
