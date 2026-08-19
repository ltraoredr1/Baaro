import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "Variables Supabase manquantes : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Mode démonstration actif."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== ABONNÉS / ABONNEMENTS / AMIS ==========

// Suivre un utilisateur
export const followUser = async (followingId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté");

  const { data, error } = await supabase
    .from("follows")
    .insert({
      follower_id: user.id,
      followed_id: followingId,
      status: "accepted",
      is_friend: false,
    });

  return { data, error };
};

// Se désabonner
export const unfollowUser = async (followingId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followed_id", followingId);

  return { error };
};

// Vérifier si je suis abonné
export const isFollowing = async (userId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", user.id)
    .eq("followed_id", userId)
    .eq("status", "accepted");

  return (count || 0) > 0;
};

// Demander en ami
export const sendFriendRequest = async (targetUserId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté");

  // Vérifie s'il existe déjà une relation dans l'autre sens
  const { data: existing } = await supabase
    .from("follows")
    .select("id, status")
    .eq("follower_id", targetUserId)
    .eq("followed_id", user.id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("follows")
      .update({ is_friend: true, status: "pending" })
      .eq("id", existing.id)
      .select()
      .single();
    return { data, error };
  }

  // Sinon on crée une nouvelle demande
  const { data, error } = await supabase
    .from("follows")
    .insert({
      follower_id: user.id,
      followed_id: targetUserId,
      status: "pending",
      is_friend: true,
    })
    .select()
    .single();

  return { data, error };
};

// Accepter une demande d'ami
export const acceptFriendRequest = async (followId) => {
  const { data, error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("id", followId)
    .select()
    .single();

  return { data, error };
};

// Refuser une demande d'ami
export const rejectFriendRequest = async (followId) => {
  const { data, error } = await supabase
    .from("follows")
    .update({ status: "rejected", is_friend: false })
    .eq("id", followId)
    .select()
    .single();

  return { data, error };
};

// ========== RÉCUPÉRATION ==========

// Mes abonnements
export const getFollowing = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from("follows")
    .select("followed_id")
    .eq("follower_id", user.id)
    .eq("status", "accepted");

  return {
    data: (data || []).map((f) => f.followed_id),
    error,
  };
};

// Mes abonnés
export const getFollowers = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followed_id", user.id)
    .eq("status", "accepted");

  return {
    data: (data || []).map((f) => f.follower_id),
    error,
  };
};

// Mes amis
export const getFriends = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from("follows")
    .select("followed_id")
    .eq("follower_id", user.id)
    .eq("is_friend", true)
    .eq("status", "accepted");

  return {
    data: (data || []).map((f) => f.followed_id),
    error,
  };
};

// Demandes d'ami en attente (reçues)
export const getPendingRequests = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from("follows")
    .select("id, follower_id")
    .eq("followed_id", user.id)
    .eq("is_friend", true)
    .eq("status", "pending");

  return { data: data || [], error };
};

// ========== PROFILS ==========

// Récupérer tous les profils
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return { data, error };
};

// Récupérer un profil par ID
export const getUserById = async (userId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  return { data, error };
};
