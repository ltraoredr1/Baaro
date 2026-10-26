/**
 * Utilitaires engagement vidéo BAARO :
 * hashtags, collab (stitch/duo/reply), cadeaux, playlists.
 */
import { supabase } from "../supabaseClient.js";

/** Extrait les #hashtags d'un texte (sans #, lower). */
export function extractHashtags(text = "") {
  const matches = String(text).match(/#([A-Za-zÀ-ÿ0-9_]{2,40})/g) || [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

/** Enregistre les hashtags d'une vidéo (RPC ou fallback client). */
export async function registerVideoHashtags(videoId, title, description) {
  if (!videoId) return;
  const text = [title, description].filter(Boolean).join(" ");
  try {
    const { error } = await supabase.rpc("register_video_hashtags", {
      p_video_id: videoId,
      p_text: text,
    });
    if (!error) return;
  } catch {
    // fallback ci-dessous
  }

  const tags = extractHashtags(text);
  if (!tags.length) return;
  await supabase.from("video_hashtags").delete().eq("video_id", videoId);
  await supabase.from("video_hashtags").insert(
    tags.map((tag) => ({ video_id: videoId, tag })),
  );
}

export async function getHashtagLeaderboard(tag, limit = 30) {
  const clean = String(tag || "").replace(/^#/, "").trim();
  if (!clean) return [];
  const { data, error } = await supabase.rpc("get_hashtag_leaderboard", {
    p_tag: clean,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function listActiveChallenges() {
  const { data, error } = await supabase
    .from("video_challenges")
    .select("*")
    .eq("status", "active")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listGiftCatalog() {
  const { data, error } = await supabase
    .from("video_gifts_catalog")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Démarre un checkout cadeau via le flux monétisation existant.
 * Le serveur doit créer un intent tip/gift avec metadata.
 * Fallback : tip générique avec metadata gift_code.
 */
export async function startGiftCheckout({
  videoId,
  giftCode,
  creatorId,
  provider = "cinetpay",
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("AUTH_REQUIRED");

  // Préférer un produit catalogue dédié si présent, sinon tip avec metadata
  const { data: intent, error } = await supabase.rpc(
    "start_monetization_checkout",
    {
      p_product_code: `video_gift_${giftCode}`,
      p_metadata: {
        source: "video_gift",
        video_id: videoId,
        gift_code: giftCode,
        creator_id: creatorId,
      },
    },
  );

  // Si le produit gift n'existe pas encore, on tente un tip standard
  if (error) {
    const { data: tipIntent, error: tipError } = await supabase.rpc(
      "start_monetization_checkout",
      {
        p_product_code: "tip_custom",
        p_metadata: {
          source: "video_gift",
          video_id: videoId,
          gift_code: giftCode,
          creator_id: creatorId,
        },
      },
    );
    if (tipError) throw tipError;
    return { intent: tipIntent, provider };
  }

  return { intent, provider };
}

/** Enregistre l'événement cadeau après paiement (appelé côté serveur idéalement). */
export async function recordGiftEvent({
  videoId,
  giftCode,
  checkoutIntentId = null,
}) {
  const { data, error } = await supabase.rpc("record_video_gift", {
    p_video_id: videoId,
    p_sender_id: (await supabase.auth.getUser()).data?.user?.id,
    p_gift_code: giftCode,
    p_checkout_intent_id: checkoutIntentId,
  });
  if (error) throw error;
  return data;
}

export async function getCreatorTopGifters(creatorId, days = 30, limit = 20) {
  const { data, error } = await supabase.rpc("get_creator_top_gifters", {
    p_creator_id: creatorId,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function getPlaylistVideos(playlistId) {
  const { data, error } = await supabase.rpc("get_playlist_videos", {
    p_playlist_id: playlistId,
  });
  if (error) throw error;
  return data || [];
}

export async function createPlaylist({ title, description, isSeries = true }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("AUTH_REQUIRED");

  const { data, error } = await supabase
    .from("video_playlists")
    .insert({
      author_id: userId,
      title: title.trim(),
      description: description?.trim() || null,
      is_series: isSeries,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function addVideoToPlaylist(playlistId, videoId, position = 0) {
  const { error } = await supabase.from("video_playlist_items").upsert({
    playlist_id: playlistId,
    video_id: videoId,
    position,
  });
  if (error) throw error;

  await supabase
    .from("videos")
    .update({ playlist_id: playlistId })
    .eq("id", videoId);
}

export async function listMyPlaylists() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("video_playlists")
    .select("*")
    .eq("author_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Payload collab à fusionner dans insertVideo */
export function buildCollabPayload(collab) {
  if (!collab?.mode) return {};
  return {
    collab_mode: collab.mode,
    source_video_id: collab.sourceVideoId || null,
    reply_to_comment_id: collab.replyToCommentId || null,
    reply_to_video_id: collab.replyToVideoId || null,
    stitch_start_ms: collab.stitchStartMs ?? null,
    stitch_end_ms: collab.stitchEndMs ?? null,
    playlist_id: collab.playlistId || null,
  };
}
