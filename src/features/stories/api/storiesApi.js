// Seul fichier (avec highlightsApi) qui parle à Supabase pour les stories.
import { supabase } from '../../../supabaseClient.js';
import { uploadExternalMedia } from '../../../lib/externalMedia.js';
import { MAX_UPLOAD_BYTES, FOLLOWS, REACTIONS } from '../constants.js';

const COLUMNS =
  'id, author_id, media_url, media_type, caption, audio_url, audio_title, poll, product, background, stickers, visibility, publish_at, expires_at, created_at';
const recordedStoryViews = new Set();
const pendingStoryViews = new Set();

/** Transforme une erreur Supabase en message lisible, en gardant le code d'origine. */
function friendlyError(error, fallback) {
  const code = error?.code;
  const raw = String(error?.message || '');
  let message = raw || fallback;
  if (code === '23505') message = 'Tu as déjà fait cette action.';
  else if (code === '23503') message = 'Cette story n’existe plus.';
  else if (code === '42501' || /row-level security/i.test(raw)) message = 'Action non autorisée sur cette story.';
  else if (code === 'PGRST301' || /jwt/i.test(raw)) message = 'Session expirée, reconnecte-toi.';
  else if (/failed to fetch|networkerror|load failed/i.test(raw)) message = 'Connexion impossible, réessaie.';
  const wrapped = new Error(message);
  wrapped.code = code;
  return wrapped;
}

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

/**
 * Stories passées du propriétaire (expirées, non supprimées).
 * Conservées pour l'historique / insights après les 24 h.
 * @param {string} userId
 * @param {{ days?: number, limit?: number }} [opts]
 */
export async function fetchMyPastStories(userId, opts = {}) {
  if (!userId) return [];
  const days = Number.isSafeInteger(opts.days) && opts.days > 0 ? opts.days : 14;
  const limit = Number.isSafeInteger(opts.limit) && opts.limit > 0 ? Math.min(opts.limit, 100) : 40;
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select(COLUMNS)
    .eq('author_id', userId)
    .lte('expires_at', now.toISOString())
    .gte('publish_at', since)
    .is('deleted_at', null)
    .order('publish_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Compteurs en lot pour plusieurs stories (historique).
 * @param {string[]} storyIds
 * @returns {Promise<Record<string, { views: number, likes: number }>>}
 */
export async function fetchStoryCountsBatch(storyIds) {
  const ids = [...new Set((storyIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const [viewsRes, likesRes] = await Promise.all([
    supabase.from('story_views').select('story_id').in('story_id', ids),
    supabase.from('story_reactions').select('story_id').in('story_id', ids),
  ]);
  if (viewsRes.error) throw viewsRes.error;
  if (likesRes.error) throw likesRes.error;
  const views = {};
  const likes = {};
  for (const row of viewsRes.data || []) {
    views[row.story_id] = (views[row.story_id] || 0) + 1;
  }
  for (const row of likesRes.data || []) {
    likes[row.story_id] = (likes[row.story_id] || 0) + 1;
  }
  const out = {};
  for (const id of ids) {
    out[id] = { views: views[id] || 0, likes: likes[id] || 0 };
  }
  return out;
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

/**
 * Recherche de profils (mentions, identification).
 * - accepte « @handle » ; les caractères spéciaux du filtre sont neutralisés ;
 * - les handles qui commencent par la saisie passent en premier ;
 * - `excludeId` retire l'utilisateur courant des résultats.
 * @param {string} query
 * @param {{ excludeId?: string, limit?: number }} [opts]
 */
export async function searchProfiles(query, opts = {}) {
  const term = String(query || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[%,()*]/g, '')
    .replace(/[\\_]/g, '\\$&');
  if (term.length < 2) return [];
  const limit = Number.isSafeInteger(opts.limit) && opts.limit > 0 ? Math.min(opts.limit, 20) : 6;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit + 1 + (opts.excludeId ? 1 : 0));
  if (error) throw error;

  const lower = term.replace(/\\/g, '').toLowerCase();
  const rank = (p) => {
    const handle = String(p.handle || '').toLowerCase();
    if (handle === lower) return 0;
    if (handle.startsWith(lower)) return 1;
    return 2;
  };
  return (data || [])
    .filter((p) => !opts.excludeId || p.id !== opts.excludeId)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

export async function fetchProductStats() {
  const { data, error } = await supabase.rpc('get_story_product_stats');
  if (error) throw error;
  return data || [];
}

// ---------- Écriture ----------
export async function recordStoryView(storyId) {
  if (!storyId) return false;
  if (recordedStoryViews.has(storyId) || pendingStoryViews.has(storyId)) return true;
  pendingStoryViews.add(storyId);
  try {
    const { error } = await supabase.rpc('record_story_view', { p_story_id: storyId });
    if (error) {
      console.warn('[Stories] vue non enregistrée :', error.message);
      return false;
    }
    recordedStoryViews.add(storyId);
    return true;
  } catch (error) {
    console.warn('[Stories] vue non enregistrée :', error?.message || error);
    return false;
  } finally {
    pendingStoryViews.delete(storyId);
  }
}

export async function setReaction(storyId, userId, emoji) {
  if (!storyId || !userId || !REACTIONS.includes(emoji)) throw new Error('Réaction invalide.');
  const { error } = await supabase
    .from('story_reactions')
    .upsert({ story_id: storyId, user_id: userId, reaction: emoji }, { onConflict: 'story_id,user_id' });
  if (error) throw friendlyError(error, 'Réaction impossible.');
}

export async function clearReaction(storyId, userId) {
  if (!storyId || !userId) throw new Error('Utilisateur ou story invalide.');
  const { error } = await supabase.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', userId);
  if (error) throw friendlyError(error, 'Réaction impossible.');
}

export async function sendReply(storyId, userId, body) {
  const cleanBody = String(body || '').trim();
  if (!storyId || !userId || cleanBody.length < 1 || cleanBody.length > 2000) throw new Error('Réponse invalide.');
  const { error } = await supabase.from('story_replies').insert({ story_id: storyId, sender_id: userId, body: cleanBody });
  if (error) throw friendlyError(error, 'Envoi impossible.');
}

export async function answerSticker(storyId, stickerId, userId, body) {
  const cleanBody = String(body || '').trim();
  if (!storyId || !stickerId || !userId || cleanBody.length < 1 || cleanBody.length > 300) throw new Error('Réponse au sticker invalide.');
  const { error } = await supabase
    .from('story_sticker_responses')
    .insert({ story_id: storyId, sticker_id: stickerId, user_id: userId, body: cleanBody });
  if (error) throw friendlyError(error, 'Envoi impossible.');
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
    compress: true, maxImageSide: 1080, imageQuality: 0.82,
  });
}

export function subscribeToStories(onChange) {
  const ch = supabase
    .channel('stories_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
