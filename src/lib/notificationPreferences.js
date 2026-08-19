import { supabase } from "../supabaseClient";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  push_enabled: true,
  messages: true,
  social: true,
  live: true,
  wallet: true,
  marketing: false,
};

export async function getNotificationPreferences() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié", data: null };

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, data: null };
  return {
    ok: true,
    data: data || { user_id: user.id, ...DEFAULT_NOTIFICATION_PREFERENCES },
  };
}

export async function saveNotificationPreferences(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  const safe = {};
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
    if (key in patch) safe[key] = Boolean(patch[key]);
  }

  const { error } = await supabase.from("notification_preferences").upsert(
    { user_id: user.id, ...safe, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}

export function shouldNotify(preferences, category) {
  if (!preferences?.push_enabled) return false;
  if (category === "message") return preferences.messages !== false;
  if (category === "social") return preferences.social !== false;
  if (category === "live") return preferences.live !== false;
  if (category === "wallet") return preferences.wallet !== false;
  if (category === "marketing") return preferences.marketing === true;
  return true;
}
