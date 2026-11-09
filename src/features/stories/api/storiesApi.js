// Seul fichier (avec highlightsApi) qui parle à Supabase pour les stories.
import { supabase } from '../../../supabaseClient.js';
import { uploadExternalMedia } from '../../../lib/externalMedia.js';
import { MAX_UPLOAD_BYTES, FOLLOWS } from '../constants.js';

const COLUMNS =
  'id, author_id, media_url, media_type, caption, audio_url, audio_title, poll, product, background, stickers, visibility, publish_at, expires_at, created_at';

// ---------- Lecture ----------
export async function fetchActiveStories() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select(COLUMNS)
    .gt('expires_at', now)
    .lte('publish_at', now)          // les programmées ne sont pas encore visibles
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw error;

  const ids = [...new Set((data || []).map((s) => s.author_id).filter(Boolean))];
  let profiles = [];
  if (ids.length) {
    const { data: p, error: pe } = await supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url, flag')
      .in('id', ids);
    if (pe) throw pe;
    profiles = p || [];
  }
  const map = new Map(profiles.map((p) => [p.id, p]));
  return (data || []).map((s) => ({ ...s, profiles: map.get(s.author_id) || null }));
}

export async function fetchFollowingIds(userId) {
  const { data, error } = await supabase
    .from(FOLLOWS.table)
    .select(FOLLOWS.following)
    .eq(FOLLOWS.follower, userId)
    .eq(FOLLOWS.statusColumn, FOLLOWS.accepted);
  if (error) {
    console.warn('[Stories] abonnements indisponibles :', error.message);
    return new Set();
  }
  return new Set((data || []).map((r) => r[FOLLOWS.following]));
}

export async function fetchScheduledStories(userId) {
  const { data, error } = await supabase
    .from('stories')
    .select('id, caption, media_type, publish_at')
    .eq('author_id', userId)
    .gt('publish_at', new Date().toISOString())
    .is('deleted_at', null)
    .order('publish_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Map storyId -> emoji choisi par l'utilisateur. */
export async function fetchMyReactions(userId, storyIds) {
  if (!userId || !storyIds?.length) return new Map();
  const { data, error } = await supabase
    .from('story_reactions')
    .select('story_id, reaction')
    .eq('user_id', userId)
    .in('story_id', storyIds);
  if (error) throw error;
  return new Map((data || []).map((r) => [r.story_id, r.reaction]));
}

export async function fetchStoryCounts(storyId) {
  const [viewsResult, likesResult] = await Promise.all([
    supabase.from('story_views').select('viewer_id', { count: 'exact', head: true }).eq('story_id', storyId),
    supabase.from('story_reactions').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
  ]);
  if (viewsResult.error) throw viewsResult.error;
  if (likesResult.error) throw likesResult.error;
  return { views: viewsResult.count ?? 0, likes: likesResult.count ?? 0 };
}

/** shop_products n'a pas de user_id : on passe par shops.owner_id -> shop_id. */
export async function fetchMyProducts(userId) {
  const { data: shops, error: se } = await supabase.from('shops').select('id').eq('owner_id', userId);
  if (se) throw se;
  const shopIds = (shops || []).map((x) => x.id);
  if (!shopIds.length) return [];
  const { data, error } = await supabase
    .from('shop_products')
    .select('*')
    .in('shop_id', shopIds)
    .eq('is_available', true);
  if (error) throw error;
  return data || [];
}

/** Produit à jour (prix / stock), car story.product est une copie figée. */
export async function fetchLiveProduct(productId) {
  const { data, error } = await supabase.from('shop_products').select('*').eq('id', productId).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function searchProfiles(query) {
  const term = (query || '').trim().replace(/[%,()]/g, '');
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, handle')
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(6);
  if (error) throw error;
  return data || [];
}

export async function fetchProductStats() {
  const { data, error } = await supabase.rpc('get_story_product_stats');
  if (error) throw error;
  return data || [];
}

// ---------- Écriture ----------
export async function recordStoryView(storyId) {
  try {
    const { error } = await supabase.rpc('record_story_view', { p_story_id: storyId });
    if (error) {
      console.warn('[Stories] vue non enregistrée :', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Stories] vue non enregistrée :', error?.message || error);
    return false;
  }
}

export async function setReaction(storyId, userId, emoji) {
  const { error } = await supabase
    .from('story_reactions')
    .upsert({ story_id: storyId, user_id: userId, reaction: emoji }, { onConflict: 'story_id,user_id' });
  if (error) throw error;
}

export async function clearReaction(storyId, userId) {
  const { error } = await supabase.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', userId);
  if (error) throw error;
}

export async function sendReply(storyId, userId, body) {
  const { error } = await supabase.from('story_replies').insert({ story_id: storyId, sender_id: userId, body });
  if (error) throw error;
}

export async function answerSticker(storyId, stickerId, userId, body) {
  const { error } = await supabase
    .from('story_sticker_responses')
    .insert({ story_id: storyId, sticker_id: stickerId, user_id: userId, body });
  if (error) throw error;
}

/** type : 'view' | 'click' | 'add_to_cart' | 'purchase' */
export async function recordProductEvent({ storyId, productId, type, quantity = 1, orderId = null }) {
  if (!storyId || productId === undefined || productId === null) return false;
  if (!['view', 'click', 'add_to_cart', 'purchase'].includes(type)) return false;
  if (!Number.isSafeInteger(quantity) || quantity < 1) return false;
  try {
    const { error } = await supabase.rpc('record_story_product_event', {
      p_story_id: storyId,
      p_product_id: String(productId),
      p_event: type,
      p_quantity: quantity,
      p_order_id: orderId,
    });
    if (error) {
      console.warn('[Stories] événement produit non enregistré :', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[Stories] événement produit non enregistré :', error?.message || error);
    return false;
  }
}

export async function insertStory(payload) {
  const { error } = await supabase.from('stories').insert(payload);
  if (error) throw error;
}

/** Un seul INSERT PostgREST pour garder le lot cohérent côté PostgreSQL. */
export async function insertStories(payloads) {
  if (!Array.isArray(payloads) || payloads.length === 0) return;
  const { error } = await supabase.from('stories').insert(payloads);
  if (error) {
    const wrapped = new Error(error.message || 'Création des stories impossible');
    wrapped.code = error.code;
    // Une erreur PostgreSQL explicite signifie que la transaction d'INSERT a échoué.
    wrapped.safeToDiscard = true;
    throw wrapped;
  }
}

export async function deleteStory(storyId, authorId) {
  const { data, error } = await supabase.from('stories').delete().eq('id', storyId).eq('author_id', authorId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Story introuvable ou déjà supprimée.');
}

export async function uploadStoryMedia(file, userId, verifiedMime) {
  const uploadFile = verifiedMime && (!file.type || file.type === 'application/octet-stream')
    ? new File([file], file.name || 'story-media', { type: verifiedMime, lastModified: file.lastModified })
    : file;
  return uploadExternalMedia(uploadFile, {
    folder: 'stories', user_id: userId, maxBytes: MAX_UPLOAD_BYTES,
  });
}

export function subscribeToStories(onChange) {
  const ch = supabase
    .channel('stories_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
