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
export const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.id) throw new Error("Non connecté");
  return user.id;
};

// ========== FOLLOWS (auth.users.id) ==========
export const followUser = async (targetUserId) => {
  const userId = await getCurrentUserId();
  if (!targetUserId || targetUserId === userId) throw new Error("Cible invalide");
  const { data, error } = await supabase.from("follows").upsert(
    { follower_id: userId, followed_id: targetUserId, status: 'accepted', is_friend: false },
    { onConflict: 'follower_id,followed_id' }
  ).select().single();
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
  if (!targetUserId || targetUserId === userId) throw new Error("Cible invalide");
  const { data: existing } = await supabase.from("follows").select("status,is_friend").eq("follower_id", userId).eq("followed_id", targetUserId).maybeSingle();
  if (existing?.is_friend && existing.status === "accepted") return { data: existing, error: null };
  const { data, error } = await supabase.from("follows").upsert({ follower_id: userId, followed_id: targetUserId, status: "pending", is_friend: true }, { onConflict: "follower_id,followed_id" }).select().single();
  return { data, error };
};

export const acceptFriendRequest = async (followerId) => {
  const userId = await getCurrentUserId();
  return await supabase.from("follows").update({ status: "accepted", is_friend: true }).eq("follower_id", followerId).eq("followed_id", userId).eq("status", "pending").select().single();
};

export const rejectFriendRequest = async (followerId) => {
  const userId = await getCurrentUserId();
  return await supabase.from("follows").update({ status: "rejected", is_friend: false }).eq("follower_id", followerId).eq("followed_id", userId).eq("status", "pending").select().single();
};

export const getFollowing = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("followed_id").eq("follower_id", userId).eq("status", "accepted");
  return { data: (data || []).map(f => f.followed_id), error };
};

export const getFollowers = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id").eq("followed_id", userId).eq("status", "accepted");
  return { data: (data || []).map(f => f.follower_id), error };
};

export const getFriends = async () => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("follows").select("follower_id,followed_id").eq("is_friend", true).eq("status", "accepted").or(`follower_id.eq.${userId},followed_id.eq.${userId}`);
  const ids = (data || []).map(row => row.follower_id === userId ? row.followed_id : row.follower_id);
  return { data: [...new Set(ids)], error };
};

export const getPendingRequests = async () => {
  const userId = await getCurrentUserId();
  return await supabase.from("follows").select("follower_id,created_at,profiles!follows_follower_id_fkey(display_name,handle,flag,avatar_url)").eq("followed_id", userId).eq("is_friend", true).eq("status", "pending").order("created_at", { ascending: false });
};

export const getAllUsers = async (limit = 50) => {
  return await supabase.from("profiles").select("id,display_name,handle,flag,avatar_url,bio").order("created_at", { ascending: false }).limit(limit);
};

export const getUserById = async (userId) => {
  if (!userId) return { data: null, error: new Error("id requis") };
  return await supabase.from("profiles").select("id,display_name,handle,flag,avatar_url,bio,phone").eq("id", userId).maybeSingle();
};

// ========== COMMENTS FIX 7/12 ==========
export const addComment = async ({ post_id, video_id, text }) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Non authentifié");
  const res = await fetch(`/api/social`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'comment', post_id, video_id, text })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json;
};
