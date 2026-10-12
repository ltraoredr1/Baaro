import { supabase } from "../supabaseClient";

/**
 * Préférences push BAARO.
 * Plus de notion "crypto wallet" — catégorie "earnings"
 * (gains créateur, tips, payouts, économie réelle XOF).
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
    const userRes = await supabase.auth.getUser();
    const user = userRes.data?.user;
    if (!user) {
      return { ok: true, data: loadLocal(), local: true };
    }

    const res = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (res.error) {
      console.error("getNotificationPreferences:", res.error);
      return {
        ok: true,
        data: loadLocal(),
        local: true,
        error: res.error.message,
      };
    }

    let row = res.data || {};
    if (row.wallet !== undefined && row.earnings === undefined) {
      row = { ...row, earnings: row.wallet };
    }

    const data = res.data
      ? { ...DEFAULT_NOTIFICATION_PREFERENCES, ...row, user_id: user.id }
      : { user_id: user.id, ...DEFAULT_NOTIFICATION_PREFERENCES };

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

    const userRes = await supabase.auth.getUser();
    const user = userRes.data?.user;
    if (!user) {
      return { ok: true, local: true };
    }

    const res = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        ...safe,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (res.error) {
      console.error("saveNotificationPreferences:", res.error);
      return { ok: true, local: true, error: res.error.message };
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
