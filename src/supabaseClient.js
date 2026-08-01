import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key";

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "Variables Supabase manquantes : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
    "Mode démonstration actif avec données de secours."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== ABONNÉS / ABONNEMENTS / AMIS ==========

// Suivre
export const followUser = async (followingId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');

  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: followingId });

  return { data, error };
};

// Se désabonner
export const unfollowUser = async (followingId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', followingId);

  return { error };
};

// Vérifier si je suis abonné
export const isFollowing = async (userId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', user.id)
    .eq('following_id', userId);

  return count > 0;
};

// Demander en ami
export const sendFriendRequest = async (userId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');

  const { data: existing } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', userId)
    .eq('following_id', user.id);

  if (existing?.length > 0) {
    const { data, error } = await supabase
      .from('follows')
      .update({ is_friend: true, status: 'pending' })
      .eq('id', existing[0].id);
    return { data, error };
  }

  const { data, error } = await supabase
    .from('follows')
    .insert({ 
      follower_id: userId,
      following_id: user.id,
      status: 'pending',
      is_friend: true
    });

  return { data, error };
};

// Accepter demande
export const acceptFriendRequest = async (followId) => {
  const { data, error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('id', followId);

  return { data, error };
};

// Refuser demande
export const rejectFriendRequest = async (followId) => {
  const { data, error } = await supabase
    .from('follows')
    .update({ status: 'rejected', is_friend: false })
    .eq('id', followId);

  return { data, error };
};

// ========== RÉCUPÉRATION ==========

// Mes abonnements
export const getFollowing = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id)
    .eq('status', 'accepted');

  return { data: data?.map(f => f.following_id) || [], error };
};

// Mes abonnés
export const getFollowers = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', user.id)
    .eq('status', 'accepted');

  return { data: data?.map(f => f.follower_id) || [], error };
};

// Mes amis
export const getFriends = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id)
    .eq('is_friend', true)
    .eq('status', 'accepted');

  return { data: data?.map(f => f.following_id) || [], error };
};

// Demandes en attente
export const getPendingRequests = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const { data, error } = await supabase
    .from('follows')
    .select('id, follower_id')
    .eq('following_id', user.id)
    .eq('is_friend', true)
    .eq('status', 'pending');

  return { data: data || [], error };
};
