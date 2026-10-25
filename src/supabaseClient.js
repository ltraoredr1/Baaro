import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("VITE_SUPABASE_URL / ANON_KEY manquantes");
}

const isNative = Capacitor.isNativePlatform();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,
    storageKey: "baaro-auth",
  },
});

// compat pour tous les imports existants
export default supabase;

// ========== ID UNIQUE ==========
// getSession() lit la session locale (aucun appel réseau, fonctionne hors ligne),
// alors que getUser() interroge le serveur Supabase À CHAQUE appel.
// La sécurité reste assurée côté serveur : les règles RLS vérifient le JWT.
const getSessionUserId = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
};

export const getCurrentUserId = async () => {
  const id = await getSessionUserId();
  if (!id) throw new Error("Non connecté");
  return id;
};

// ========== FOLLOWS (auth.users.id) ==========
export const followUser = async (targetUserId) => {
  const user_id = await getCurrentUserId();
  if (!targetUserId || targetUserId === user_id) throw new Error("Cible invalide");
  const { data, error } = await supabase.from("follows").upsert(
    { follower_id: user_id, followed_id: targetUserId, status: "accepted", is_friend: false },
    { onConflict: "follower_id,followed_id" }
  ).select().single();
  return { data, error };
};

export const unfollowUser = async (targetUserId) => {
  const user_id = await getCurrentUserId();
  const { error } = await supabase.from("follows").delete().eq("follower_id", user_id).eq("followed_id", targetUserId);
  return { error };
};

export const isFollowing = async (targetUserId) => {
  let uid = null;
  try {
    uid = await getSessionUserId();
  } catch {
    return false;
  }
  if (!uid || !targetUserId || uid === targetUserId) return false;
  const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", uid).eq("followed_id", targetUserId).eq("status", "accepted").maybeSingle();
  return Boolean(data);
};

export const sendFriendRequest = async (targetUserId) => {
  const user_id = await getCurrentUserId();
  if (!targetUserId || targetUserId === user_id) throw new Error("Cible invalide");

  // Une demande reçue de cette personne : on l'accepte au lieu d'en créer une seconde.
  const { data: incoming } = await supabase.from("follows").select("status,is_friend").eq("follower_id", targetUserId).eq("followed_id", user_id).maybeSingle();
  if (incoming?.is_friend && incoming.status === "pending") return acceptFriendRequest(targetUserId);
  if (incoming?.is_friend && incoming.status === "accepted") return { data: incoming, error: null };

  // Déjà amis ou demande déjà envoyée : aucune nouvelle demande.
  const { data: existing } = await supabase.from("follows").select("status,is_friend").eq("follower_id", user_id).eq("followed_id", targetUserId).maybeSingle();
  if (existing?.is_friend && (existing.status === "accepted" || existing.status === "pending")) return { data: existing, error: null };

  const { data, error } = await supabase.from("follows").upsert(
    { follower_id: user_id, followed_id: targetUserId, status: "pending", is_friend: true },
    { onConflict: "follower_id,followed_id" }
  ).select().single();
  if (!error) {
    import("./lib/notifyInteraction.js")
      .then((m) =>
        m.notifyInteraction({ contentType: "user", interactionType: "friend_request", targetId: targetUserId })
      )
      .catch(() => {});
  }
  return { data, error };
};

export const acceptFriendRequest = async (followerId) => {
  const user_id = await getCurrentUserId();
  const result = await supabase.from("follows").update({ status: "accepted", is_friend: true }).eq("follower_id", followerId).eq("followed_id", user_id).eq("status", "pending").select().single();
  if (result.error) return result;
  // Ligne réciproque : l'amitié devient symétrique (liste d'amis des deux côtés).
  const { error: reciprocalError } = await supabase.from("follows").upsert(
    { follower_id: user_id, followed_id: followerId, status: "accepted", is_friend: true },
    { onConflict: "follower_id,followed_id" }
  );
  if (reciprocalError) console.warn("[friends] ligne réciproque non créée :", reciprocalError.message);
  import("./lib/notifyInteraction.js")
    .then((m) =>
      m.notifyInteraction({ contentType: "user", interactionType: "friend_accepted", targetId: followerId })
    )
    .catch(() => {});
  return result;
};

export const rejectFriendRequest = async (followerId) => {
  const user_id = await getCurrentUserId();
  return await supabase.from("follows").update({ status: "rejected", is_friend: false }).eq("follower_id", followerId).eq("followed_id", user_id).eq("status", "pending").select().single();
};

export const getFollowing = async () => {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("followed_id").eq("follower_id", user_id).eq("status", "accepted");
  return { data: (data || []).map((f) => f.followed_id), error };
};

export const getFollowers = async () => {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id").eq("followed_id", user_id).eq("status", "accepted");
  return { data: (data || []).map((f) => f.follower_id), error };
};

export const getFriends = async () => {
  const user_id = await getCurrentUserId();
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id,followed_id")
    .eq("is_friend", true)
    .eq("status", "accepted")
    .or(`follower_id.eq.${user_id},followed_id.eq.${user_id}`);
  const ids = (data || []).map((row) => (row.follower_id === user_id ? row.followed_id : row.follower_id));
  return { data: [...new Set(ids)], error };
};

export const getPendingRequests = async () => {
  const user_id = await getCurrentUserId();
  return await supabase
    .from("follows")
    .select("follower_id,created_at,profiles!follows_follower_id_fkey(display_name,handle,flag,avatar_url)")
    .eq("followed_id", user_id)
    .eq("is_friend", true)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
};

export const getAllUsers = async (limit = 50) => {
  return await supabase
    .from("profiles")
    .select("id,display_name,handle,flag,avatar_url,bio")
    .order("created_at", { ascending: false })
    .limit(limit);
};

export const getUserById = async (user_id) => {
  if (!user_id) return { data: null, error: new Error("id requis") };

  // Champs publics uniquement. Le téléphone n'est renvoyé que si le demandeur
  // est le propriétaire du profil (minimisation des données personnelles).
  const publicCols = "id,display_name,handle,flag,avatar_url,bio";
  let currentId = null;
  try {
    currentId = await getSessionUserId();
  } catch {}
  const isOwner = Boolean(currentId && currentId === user_id);
  const cols = isOwner ? `${publicCols},phone` : publicCols;

  return await supabase.from("profiles").select(cols).eq("id", user_id).maybeSingle();
};

// ========== COMMENTS FIX 7/12 ==========
export const addComment = async ({ post_id, video_id, text }) => {
  const { callSocial } = await import("./lib/notifyInteraction.js");
  const result = await callSocial("comment", { post_id, video_id, text });
  if (!result) throw new Error("Non authentifié");
  if (!result.ok) throw new Error(result.body?.error || `Erreur serveur (${result.status})`);
  return result.body;
};
