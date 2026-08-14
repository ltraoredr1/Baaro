/**
 * BAARO — Couche de requêtes Supabase centralisée
 * Toutes les lectures / écritures passent par ici.
 * Utilise handleDbError pour les messages FR.
 */

import { supabase } from "../supabaseClient";
import { handleDbError, getDbErrorMessage } from "./dbErrors";

// ============================================================
// HELPERS INTERNES
// ============================================================

async function run(queryPromise, { showToast, fallback } = {}) {
  const { data, error, count } = await queryPromise;
  if (error) {
    if (showToast) handleDbError(error, showToast, fallback);
    return { data: null, error, count: count ?? null };
  }
  return { data, error: null, count: count ?? null };
}

// ============================================================
// PROFILS
// ============================================================

export async function getProfile(userId, opts = {}) {
  return run(
    supabase
      .from("profiles")
      .select("user_id, display_name, handle, flag, bio, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    { ...opts, fallback: "Erreur chargement profil" }
  );
}

export async function getProfilesByIds(ids, opts = {}) {
  if (!ids?.length) return { data: [], error: null };
  return run(
    supabase
      .from("profiles")
      .select("user_id, display_name, handle, flag, bio")
      .in("user_id", ids),
    { ...opts, fallback: "Erreur chargement profils" }
  );
}

export async function upsertProfile(userId, fields, opts = {}) {
  return run(
    supabase
      .from("profiles")
      .upsert({ user_id: userId, ...fields })
      .select()
      .single(),
    { ...opts, fallback: "Erreur mise à jour profil" }
  );
}

export async function searchProfiles(query, limit = 20, opts = {}) {
  if (!query?.trim()) return { data: [], error: null };
  const q = query.trim();
  return run(
    supabase
      .from("profiles")
      .select("user_id, display_name, handle, flag, bio")
      .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
      .limit(limit),
    { ...opts, fallback: "Erreur recherche" }
  );
}

// ============================================================
// FOLLOWS / AMIS
// ============================================================

export async function followUser(currentUserId, targetUserId, opts = {}) {
  if (currentUserId === targetUserId) {
    const err = { message: "Impossible de se suivre soi-même" };
    if (opts.showToast) handleDbError(err, opts.showToast);
    return { data: null, error: err };
  }
  return run(
    supabase
      .from("follows")
      .insert({
        follower_id: currentUserId,
        following_id: targetUserId,
        status: "accepted",
        is_friend: false,
      })
      .select()
      .maybeSingle(),
    { ...opts, fallback: "Erreur abonnement" }
  );
}

export async function unfollowUser(currentUserId, targetUserId, opts = {}) {
  return run(
    supabase
      .from("follows")
      .delete()
      .eq("follower_id", currentUserId)
      .eq("following_id", targetUserId),
    { ...opts, fallback: "Erreur désabonnement" }
  );
}

export async function isFollowing(currentUserId, targetUserId) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", currentUserId)
    .eq("following_id", targetUserId)
    .eq("status", "accepted");
  return { following: !error && (count || 0) > 0, error };
}

export async function getFollowers(userId, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", userId)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.follower_id),
    error,
  };
}

export async function getFollowing(userId, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.following_id),
    error,
  };
}

export async function getFollowersCount(userId) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId)
    .eq("status", "accepted");
  return { count: error ? 0 : count || 0, error };
}

export async function getFollowingCount(userId) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId)
    .eq("status", "accepted");
  return { count: error ? 0 : count || 0, error };
}

export async function sendFriendRequest(currentUserId, targetUserId, opts = {}) {
  // Vérifie relation inverse
  const { data: existing } = await supabase
    .from("follows")
    .select("id, status")
    .eq("follower_id", targetUserId)
    .eq("following_id", currentUserId)
    .maybeSingle();

  if (existing) {
    return run(
      supabase
        .from("follows")
        .update({ is_friend: true, status: "pending" })
        .eq("id", existing.id)
        .select()
        .single(),
      { ...opts, fallback: "Erreur demande d'ami" }
    );
  }

  return run(
    supabase
      .from("follows")
      .insert({
        follower_id: currentUserId,
        following_id: targetUserId,
        status: "pending",
        is_friend: true,
      })
      .select()
      .single(),
    { ...opts, fallback: "Erreur demande d'ami" }
  );
}

export async function acceptFriendRequest(followId, opts = {}) {
  return run(
    supabase
      .from("follows")
      .update({ status: "accepted", is_friend: true })
      .eq("id", followId)
      .select()
      .single(),
    { ...opts, fallback: "Erreur acceptation" }
  );
}

export async function rejectFriendRequest(followId, opts = {}) {
  return run(
    supabase
      .from("follows")
      .update({ status: "rejected", is_friend: false })
      .eq("id", followId)
      .select()
      .single(),
    { ...opts, fallback: "Erreur refus" }
  );
}

export async function getFriends(userId, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .eq("is_friend", true)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.following_id),
    error,
  };
}

export async function getPendingFriendRequests(userId, opts = {}) {
  return run(
    supabase
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("following_id", userId)
      .eq("is_friend", true)
      .eq("status", "pending"),
    { ...opts, fallback: "Erreur chargement demandes" }
  );
}

// ============================================================
// WALLET / POINTS
// ============================================================

export async function getWallet(userId, opts = {}) {
  return run(
    supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle(),
    { ...opts, fallback: "Erreur chargement portefeuille" }
  );
}

export async function getCryptoHoldings(userId, opts = {}) {
  return run(
    supabase
      .from("crypto_holdings")
      .select("holdings")
      .eq("user_id", userId)
      .maybeSingle(),
    { ...opts, fallback: "Erreur chargement crypto" }
  );
}

// ============================================================
// POSTS (feed)
// ============================================================

export async function getPosts({ limit = 20, offset = 0 } = {}, opts = {}) {
  return run(
    supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    { ...opts, fallback: "Erreur chargement publications" }
  );
}

export async function getPostsCount(authorId) {
  const { count, error } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("author_id", authorId);
  return { count: error ? 0 : count || 0, error };
}

// ============================================================
// UTILITAIRE : charger profil + stats en une fois
// ============================================================

export async function getProfileWithStats(userId, currentUserId = null) {
  const [profileRes, postsRes, followersRes, followingRes] = await Promise.all([
    getProfile(userId),
    getPostsCount(userId),
    getFollowersCount(userId),
    getFollowingCount(userId),
  ]);

  let followState = { isFollowing: false, isFriend: false, friendStatus: null };

  if (currentUserId && currentUserId !== userId) {
    const { data: rel } = await supabase
      .from("follows")
      .select("status, is_friend")
      .eq("follower_id", currentUserId)
      .eq("following_id", userId)
      .maybeSingle();

    if (rel) {
      followState = {
        isFollowing: rel.status === "accepted",
        isFriend: rel.is_friend && rel.status === "accepted",
        friendStatus: rel.is_friend ? rel.status : null,
      };
    } else {
      const { data: reverse } = await supabase
        .from("follows")
        .select("status, is_friend")
        .eq("follower_id", userId)
        .eq("following_id", currentUserId)
        .eq("is_friend", true)
        .maybeSingle();
      if (reverse) {
        followState.friendStatus = reverse.status;
      }
    }
  }

  return {
    profile: profileRes.data,
    stats: {
      posts: postsRes.count,
      followers: followersRes.count,
      following: followingRes.count,
    },
    ...followState,
    error: profileRes.error,
  };
}

export { getDbErrorMessage, handleDbError };
