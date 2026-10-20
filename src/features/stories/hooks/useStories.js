import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/storiesApi.js';

/** Abonnements (et mes propres stories) d'abord, puis les autres. Ordre récent→ancien conservé. */
function sortStories(list, following, userId) {
  const rank = (s) => (s.author_id === userId || following.has(s.author_id) ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** Données : liste, réactions, compteurs, realtime. Aucune UI ici. */
export function useStories(userId, setError) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [myReactions, setMyReactions] = useState(() => new Map());

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [list, following] = await Promise.all([
        api.fetchActiveStories(),
        userId ? api.fetchFollowingIds(userId) : Promise.resolve(new Set()),
      ]);
      setStories(sortStories(list, following, userId));
      if (userId && list.length) setMyReactions(await api.fetchMyReactions(userId, list.map((s) => s.id)));
    } catch (e) {
      console.error('[Stories] load:', e);
      setError('Chargement impossible : ' + (e.message || 'erreur inconnue'));
    } finally {
      setLoading(false);
    }
  }, [userId, setError]);

  const loadCounts = useCallback(async (storyId) => {
    try {
      const c = await api.fetchStoryCounts(storyId);
      setCounts((prev) => ({ ...prev, [storyId]: c }));
    } catch (e) {
      console.error('[Stories] counts:', e);
    }
  }, []);

  useEffect(() => {
    load(true);
    return api.subscribeToStories(() => load());
  }, [load]);

  useEffect(() => {
    stories.filter((s) => s.author_id === userId).forEach((s) => loadCounts(s.id));
  }, [stories, userId, loadCounts]);

  // Lancent une exception en cas d'échec (gérée par useStoryActions)
  const toggleReaction = async (story, emoji) => {
    const current = myReactions.get(story.id);
    if (current === emoji) {
      await api.clearReaction(story.id, userId);
      setMyReactions((p) => { const n = new Map(p); n.delete(story.id); return n; });
    } else {
      await api.setReaction(story.id, userId, emoji);
      setMyReactions((p) => new Map(p).set(story.id, emoji));
    }
    if (story.author_id === userId) loadCounts(story.id);
  };

  const removeStory = async (story) => {
    await api.deleteStory(story.id, userId);
    setStories((prev) => prev.filter((x) => x.id !== story.id));
  };

  return { stories, loading, counts, myReactions, reload: load, loadCounts, toggleReaction, removeStory };
}
