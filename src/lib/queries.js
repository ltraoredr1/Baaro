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

export async function getProfile(user_id, opts = {}) {
  return run(
    supabase
      .from("profiles")
      .select("id, display_name, handle, flag, bio, created_at")
      .eq("id", user_id)
      .maybeSingle(),
    { ...opts, fallback: "Erreur chargement profil" }
  );
}

export async function getProfilesByIds(ids, opts = {}) {
  if (!ids?.length) return { data: [], error: null };
  return run(
    supabase
      .from("profiles")
      .select("id, display_name, handle, flag, bio")
      .in("id", ids),
    { ...opts, fallback: "Erreur chargement profils" }
  );
}

export async function upsertProfile(user_id, fields, opts = {}) {
  return run(
    supabase
      .from("profiles")
      .upsert({ id: user_id, ...fields })
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
      .select("id, display_name, handle, flag, bio")
      .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
      .limit(limit),
    { ...opts, fallback: "Erreur recherche" }
  );
}

// ============================================================
// FOLLOWS / AMIS
// ============================================================

export async function followUser(current_user_id, targetUserId, opts = {}) {
  if (current_user_id === targetUserId) {
    const err = { message: "Impossible de se suivre soi-même" };
    if (opts.showToast) handleDbError(err, opts.showToast);
    return { data: null, error: err };
  }
  return run(
    supabase.rpc("toggle_follow", { p_target: targetUserId }),
    { ...opts, fallback: "Erreur abonnement" }
  );
}

export async function unfollowUser(current_user_id, targetUserId, opts = {}) {
  return run(
    supabase
      .from("follows")
      .delete()
      .eq("follower_id", current_user_id)
      .eq("followed_id", targetUserId),
    { ...opts, fallback: "Erreur désabonnement" }
  );
}

export async function isFollowing(current_user_id, targetUserId) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", current_user_id)
    .eq("followed_id", targetUserId)
    .eq("status", "accepted");
  return { following: !error && (count || 0) > 0, error };
}

export async function getFollowers(user_id, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("follower_id")
      .eq("followed_id", user_id)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.follower_id),
    error,
  };
}

export async function getFollowing(user_id, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", user_id)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.followed_id),
    error,
  };
}

export async function getFollowersCount(user_id) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("followed_id", user_id)
    .eq("status", "accepted");
  return { count: error ? 0 : count || 0, error };
}

export async function getFollowingCount(user_id) {
  const { count, error } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", user_id)
    .eq("status", "accepted");
  return { count: error ? 0 : count || 0, error };
}

export async function sendFriendRequest(current_user_id, targetUserId, opts = {}) {
  // Vérifie relation inverse
  const { data: existing } = await supabase
    .from("follows")
    .select("id, status")
    .eq("follower_id", targetUserId)
    .eq("followed_id", current_user_id)
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
        follower_id: current_user_id,
        followed_id: targetUserId,
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
      .eq("follower_id", followId)
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
      .eq("follower_id", followId)
      .select()
      .single(),
    { ...opts, fallback: "Erreur refus" }
  );
}

export async function getFriends(user_id, opts = {}) {
  const { data, error } = await run(
    supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", user_id)
      .eq("is_friend", true)
      .eq("status", "accepted"),
    opts
  );
  return {
    data: (data || []).map((r) => r.followed_id),
    error,
  };
}

export async function getPendingFriendRequests(user_id, opts = {}) {
  return run(
    supabase
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("followed_id", user_id)
      .eq("is_friend", true)
      .eq("status", "pending"),
    { ...opts, fallback: "Erreur chargement demandes" }
  );
}

// ============================================================
