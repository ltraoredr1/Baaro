import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/storiesApi.js';

/** Données : liste, likes, compteurs, realtime. Aucune UI ici. */
export function useStories(userId, setError) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [myLikes, setMyLikes] = useState(() => new Set());

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const list = await api.fetchActiveStories();
      setStories(list);
      if (userId && list.length) setMyLikes(await api.fetchMyLikedIds(userId, list.map((s) => s.id)));
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

  // Ces deux actions lancent une exception en cas d'échec (gérée par useStoryActions)
  const toggleLike = async (story) => {
    if (myLikes.has(story.id)) {
      await api.removeLike(story.id, userId);
      setMyLikes((p) => { const n = new Set(p); n.delete(story.id); return n; });
    } else {
      await api.addLike(story.id, userId);
      setMyLikes((p) => new Set(p).add(story.id));
    }
    if (story.author_id === userId) loadCounts(story.id);
  };

  const removeStory = async (story) => {
    await api.deleteStory(story.id, userId);
    setStories((prev) => prev.filter((x) => x.id !== story.id));
  };

  return { stories, loading, counts, myLikes, reload: load, loadCounts, toggleLike, removeStory };
}
