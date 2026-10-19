// Seul fichier qui parle à Supabase pour les stories.
import { supabase } from '../../../supabaseClient.js';
import { uploadExternalMedia } from '../../../lib/externalMedia.js';
import { MAX_UPLOAD_BYTES } from '../constants.js';

const COLUMNS =
  'id, author_id, media_url, media_type, caption, audio_url, audio_title, poll, product, background, visibility, expires_at, created_at';

export async function fetchActiveStories() {
  const { data, error } = await supabase
    .from('stories')
    .select(COLUMNS)
    .gt('expires_at', new Date().toISOString())
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

export async function fetchMyLikedIds(userId, storyIds) {
  const { data } = await supabase
    .from('story_reactions')
    .select('story_id')
    .eq('user_id', userId)
    .in('story_id', storyIds);
  return new Set((data || []).map((r) => r.story_id));
}

export async function fetchStoryCounts(storyId) {
  const [{ count: views }, { count: likes }] = await Promise.all([
    supabase.from('story_views').select('viewer_id', { count: 'exact', head: true }).eq('story_id', storyId),
    supabase.from('story_reactions').select('user_id', { count: 'exact', head: true }).eq('story_id', storyId),
  ]);
  return { views: views ?? 0, likes: likes ?? 0 };
}

export async function fetchMyProducts(userId) {
  const { data, error } = await supabase
    .from('shop_products')
    .select('*')
    .eq('user_id', userId)
    .eq('is_available', true);
  if (error) throw error;
  return data || [];
}

export async function recordStoryView(storyId) {
  try { await supabase.rpc('record_story_view', { p_story_id: storyId }); } catch { /* non bloquant */ }
}

export async function addLike(storyId, userId) {
  const { error } = await supabase
    .from('story_reactions')
    .upsert({ story_id: storyId, user_id: userId, reaction: '❤️' }, { onConflict: 'story_id,user_id' });
  if (error) throw error;
}

export async function removeLike(storyId, userId) {
  const { error } = await supabase.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', userId);
  if (error) throw error;
}

export async function insertStory(payload) {
  const { error } = await supabase.from('stories').insert(payload);
  if (error) throw error;
}

export async function deleteStory(storyId, authorId) {
  const { data, error } = await supabase.from('stories').delete().eq('id', storyId).eq('author_id', authorId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Story introuvable ou déjà supprimée.');
}

export async function uploadStoryMedia(file, userId) {
  const result = await uploadExternalMedia(file, { folder: 'stories', user_id: userId, maxBytes: MAX_UPLOAD_BYTES });
  return result.url;
}

export function subscribeToStories(onChange) {
  const ch = supabase
    .channel('stories_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
