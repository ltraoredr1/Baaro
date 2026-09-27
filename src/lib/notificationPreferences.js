import { supabase } from "../supabaseClient";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  push_enabled: true,
  messages: true,
  social: true,
  live: true,
  wallet: true,
  marketing: false,
};

var LOCAL_KEY = "baaro:notif_prefs";

function loadLocal() {
  try {
    var raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return Object.assign({}, DEFAULT_NOTIFICATION_PREFERENCES);
    return Object.assign({}, DEFAULT_NOTIFICATION_PREFERENCES, JSON.parse(raw));
  } catch (_) {
    return Object.assign({}, DEFAULT_NOTIFICATION_PREFERENCES);
  }
}

function saveLocal(prefs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

export async function getNotificationPreferences() {
  try {
    var userRes = await supabase.auth.getUser();
    var user = userRes.data && userRes.data.user;
    if (!user) {
      return { ok: true, data: loadLocal(), local: true };
    }

    var res = await supabase
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

    var data = res.data
      ? Object.assign({}, DEFAULT_NOTIFICATION_PREFERENCES, res.data)
      : Object.assign(
          { user_id: user.id },
          DEFAULT_NOTIFICATION_PREFERENCES
        );

    saveLocal(data);
    return { ok: true, data: data };
  } catch (e) {
    return { ok: true, data: loadLocal(), local: true, error: e.message };
  }
}

export async function saveNotificationPreferences(patch) {
  try {
    var safe = {};
    var keys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key in patch) safe[key] = Boolean(patch[key]);
    }
    if (Object.keys(safe).length === 0) {
      return { ok: false, error: "Aucune preference valide" };
    }

    var merged = Object.assign({}, loadLocal(), safe);
    saveLocal(merged);

    var userRes = await supabase.auth.getUser();
    var user = userRes.data && userRes.data.user;
    if (!user) {
      return { ok: true, local: true };
    }

    var res = await supabase.from("notification_preferences").upsert(
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

export function shouldNotify(preferences, category) {
  if (!preferences || !preferences.push_enabled) return false;
  switch (category) {
    case "message":
      return preferences.messages !== false;
    case "social":
      return preferences.social !== false;
    case "live":
      return preferences.live !== false;
    case "wallet":
      return preferences.wallet !== false;
    case "marketing":
      return preferences.marketing === true;
    default:
      return true;
  }
}
