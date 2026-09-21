import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "Variables Supabase manquantes : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Mode démonstration actif."
  );
}

// FIX NATIF : sur mobile on désactive la détection d'URL
const isNative = Capacitor.isNativePlatform();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative, // false sur APK, true sur web
    storageKey: "baaro-auth",
    // Pour une persistance 100% iOS, tu pourras passer à ça plus tard :
    // storage: {
    //   getItem: async (key) => (await Preferences.get({ key })).value,
    //   setItem: async (key, value) => await Preferences.set({ key, value }),
    //   removeItem: async (key) => await Preferences.remove({ key }),
    // }
  },
});

// ========== IDENTITÉ UTILISATEUR UNIQUE ==========
const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.id) throw new Error("Non connecté");
  return user.id;
};

// ========== ABONNÉS / ABONNEMENTS / AMIS ==========
export const followUser = async (targetUserId) => {
  const userId = await getCurrentUserId();
  if (!targetUserId || targetUserId === userId) throw new Error("Utilisateur cible invalide");
  const { data, error } = await supabase.from("follows").upsert(
    { follower_id: userId, followed_id: targetUserId, status: 'accepted', is_friend: false },
    { onConflict: 'follower_id,followed_id' }
  );
  return { data, error };
};

export const unfollowUser = async (targetUserId) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("follows").delete().eq("follower_id", userId).eq("followed_id", targetUserId);
  return { error };
};

export const isFollowing = async (targetUserId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !targetUserId || user.id === targetUserId) return false;
  const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followed_id", targetUserId).eq("status", "accepted").maybeSingle();
  return Boolean(data);
};

export const sendFriendRequest = async (targetUserId) => {
  const userId = await getCurrentUserId();
  if (!targetUserId || targetUserId === userId) throw new Error("Utilisateur cible invalide");
  const { data: existing, error: existingError } = await supabase.from("follows").select("follower_id, followed_id, status, is_friend").eq("follower_id", userId).eq("followed_id", targetUserId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.is_friend && existing.status === "accepted") return { data: existing, error: null };
  const { data, error } = await supabase.from("follows").upsert({ follower_id: userId, followed_id: targetUserId, status: "pending", is_friend: true }, { onConflict: "follower_id,followed_id" }).select("follower_id, followed_id, status, is_friend, created_at").single();
  return { data, error };
};

export const acceptFriendRequest = async (followerId) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").update({ status: "accepted", is_friend: true }).eq("follower_id", followerId).eq("followed_id", userId).eq("status", "pending").eq("is_friend", true).select("follower_id, followed_id, status, is_friend, created_at").single();
  return { data, error };
};

export const rejectFriendRequest = async (followerId) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").update({ status: "rejected", is_friend: false }).eq("follower_id", followerId).eq("followed_id", userId).eq("status", "pending").eq("is_friend", true).select("follower_id, followed_id, status, is_friend").single();
  return { data, error };
};

export const getFollowing = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("followed_id").eq("follower_id", userId).eq("status", "accepted");
  return { data: (data || []).map((f) => f.followed_id), error };
};

export const getFollowers = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id").eq("followed_id", userId).eq("status", "accepted");
  return { data: (data || []).map((f) => f.follower_id), error };
};

export const getFriends = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id, followed_id").eq("is_friend", true).eq("status", "accepted").or(`follower_id.eq.${userId},followed_id.eq.${userId}`);
  const ids = (data || []).map((row) => row.follower_id === userId ? row.followed_id : row.follower_id);
  return { data: [...new Set(ids)], error };
};

export const getPendingRequests = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id, followed_id, status, is_friend, created_at").eq("followed_id", userId).eq("is_friend", true).eq("status", "pending").order("created_at", { ascending: false });
  return { data: data || [], error };
};

export const getAllUsers = async () => {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  return { data, error };
};

export const getUserById = async (userId) => {
  if (!userId) return { data: null, error: new Error("id requis") };
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return { data, error };
};
