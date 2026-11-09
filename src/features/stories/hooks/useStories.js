import { useCallback, useEffect, useRef, useState } from 'react';
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
  const requestVersion = useRef(0);
  const countRequests = useRef(new Map());

  const load = useCallback(async (initial = false) => {
    const version = ++requestVersion.current;
    if (initial) setLoading(true);
    try {
      const [list, following] = await Promise.all([
        api.fetchActiveStories(),
        userId ? api.fetchFollowingIds(userId) : Promise.resolve(new Set()),
      ]);
      const reactions = userId && list.length
        ? await api.fetchMyReactions(userId, list.map((s) => s.id))
        : new Map();
      if (version !== requestVersion.current) return;
      setStories(sortStories(list, following, userId));
      setMyReactions(reactions);
      setCounts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => list.some((s) => s.id === id))));
    } catch (e) {
      if (version !== requestVersion.current) return;
      console.error('[Stories] load:', e);
      setError('Chargement impossible : ' + (e.message || 'erreur inconnue'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [userId, setError]);

  const loadCounts = useCallback(async (storyId) => {
    const current = (countRequests.current.get(storyId) || 0) + 1;
    countRequests.current.set(storyId, current);
    try {
      const c = await api.fetchStoryCounts(storyId);
      if (countRequests.current.get(storyId) === current) setCounts((prev) => ({ ...prev, [storyId]: c }));
    } catch (e) {
      if (countRequests.current.get(storyId) !== current) return;
      console.error('[Stories] counts:', e);
      setCounts((prev) => { const next = { ...prev }; delete next[storyId]; return next; });
    }
  }, []);

  useEffect(() => {
    setStories([]);
    setCounts({});
    setMyReactions(new Map());
    setLoading(true);
    const unsubscribe = api.subscribeToStories(() => load());
    load(true);
    return () => {
      requestVersion.current += 1;
      unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    stories.filter((s) => s.author_id === userId).forEach((s) => loadCounts(s.id));
  }, [stories, userId, loadCounts]);

  // Lancent une exception en cas d'échec (gérée par useStoryActions)
  const toggleReaction = async (story, emoji) => {
    if (!userId) throw new Error('Connecte-toi pour réagir.');
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
    setCounts((prev) => { const next = { ...prev }; delete next[story.id]; return next; });
  };

  return { stories, loading, counts, myReactions, reload: load, loadCounts, toggleReaction, removeStory };
}
