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
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié", data: null };

    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("getNotificationPreferences:", error);
      return { ok: false, error: error.message, data: null };
    }

    return {
      ok: true,
      data: data || { user_id: user.id, ...DEFAULT_NOTIFICATION_PREFERENCES },
    };
  } catch (e) {
    console.error("getNotificationPreferences exception:", e);
    return { ok: false, error: e.message, data: null };
  }
}

export async function saveNotificationPreferences(patch) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Non authentifié" };

    // Filtrer uniquement les clés autorisées
    const safe = {};
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
      if (key in patch) {
        safe[key] = Boolean(patch[key]);
      }
    }

    // Vérifier qu'au moins une clé est présente
    if (Object.keys(safe).length === 0) {
      return { ok: false, error: "Aucune préférence valide fournie" };
    }

    const { error } = await supabase.from("notification_preferences").upsert(
      { 
        user_id: user.id, 
        ...safe, 
        updated_at: new Date().toISOString() 
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("saveNotificationPreferences:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    console.error("saveNotificationPreferences exception:", e);
    return { ok: false, error: e.message };
  }
}

export function shouldNotify(preferences, category) {
  if (!preferences?.push_enabled) return false;
  
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
