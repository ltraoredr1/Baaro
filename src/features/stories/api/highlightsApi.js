import { supabase } from '../../../supabaseClient.js';

/** Copie figée d'une story : elle survit à l'expiration des 24 h. */
const toItem = (story, highlightId, position) => ({
  highlight_id: highlightId,
  position,
  media_url: story.media_url || null,
  media_type: story.media_type || 'text',
  caption: story.caption || null,
  background: story.background || null,
  audio_url: story.audio_url || null,
  audio_title: story.audio_title || null,
  product: story.product || null,
  stickers: story.stickers || [],
});

export async function fetchHighlights(ownerId) {
  const { data, error } = await supabase
    .from('story_highlights')
    .select('id, owner_id, title, cover_url, created_at, items:story_highlight_items(id, position, media_url, media_type, caption, background, audio_url, audio_title, product, stickers)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((h) => ({ ...h, items: [...(h.items || [])].sort((a, b) => a.position - b.position) }));
}

export async function fetchProfile(ownerId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, flag')
    .eq('id', ownerId)
    .maybeSingle();
  return data || null;
}

export async function createHighlight(title, story) {
  const cover = story.media_type === 'image' ? story.media_url : null;
  const { data, error } = await supabase
    .from('story_highlights')
    .insert({ title: title.trim(), cover_url: cover })
    .select('id')
    .single();
  if (error) throw error;
  const { error: ie } = await supabase.from('story_highlight_items').insert(toItem(story, data.id, 0));
  if (ie) throw ie;
  return data.id;
}

export async function addStoryToHighlight(highlightId, story, position) {
  const { error } = await supabase.from('story_highlight_items').insert(toItem(story, highlightId, position));
  if (error) throw error;
}

export async function deleteHighlight(highlightId) {
  const { error } = await supabase.from('story_highlights').delete().eq('id', highlightId);
  if (error) throw error;
}

/** Adapte les items au format attendu par <StoryViewer>. */
export const highlightToStories = (highlight, owner) =>
  (highlight?.items || []).map((i) => ({
    ...i,
    author_id: highlight.owner_id,
    expires_at: null,
    profiles: owner || null,
  }));
