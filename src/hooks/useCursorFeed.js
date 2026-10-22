import { useState, useCallback, useRef } from "react";
import { supabase } from "@/supabaseClient.js";
import { fetchFeedPage } from "../lib/feedPagination.js";

const HOUR_MS = 60 * 60 * 1000;
const GRAVITY = 1.5; // plus c'est haut, plus les vieux posts descendent vite
const FOLLOWED_BOOST = 1.6; // posts des comptes suivis
const OWN_POST_BOOST = 3; // mes propres posts récents (< 2 h)

/** Score d'un post : engagement pondéré / âge (type « hot ranking ») */
function scorePost(post, { now, userId, followed }) {
  const created = new Date(post.created_at).getTime();
  const ageH = Number.isFinite(created) ? Math.max(0, (now - created) / HOUR_MS) : 999;

  const engagement =
    1 +
    (post.likes_count || 0) +
    3 * (post.comments_count || 0) +
    4 * (post.reposts_count || 0) +
    Math.log1p(post.views_count || 0);

  let score = engagement / Math.pow(ageH + 2, GRAVITY);

  if (post.author_id && followed.has(post.author_id)) score *= FOLLOWED_BOOST;
  if (userId && post.author_id === userId && ageH < 2) score *= OWN_POST_BOOST;

  return score;
}

/** Classe une page de lignes (égalité : le plus récent d'abord) */
function rankRows(rows, ctx) {
  const now = Date.now();
  return rows
    .map((row) => ({ row, score: scorePost(row, { ...ctx, now }) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.row.created_at) - new Date(a.row.created_at);
    })
    .map((x) => x.row);
}

/**
 * Pagination du fil par curseur, avec classement.
 * - posts : lignes brutes Supabase, classées par pertinence à chaque page
 * - setPosts : pour les mises à jour optimistes (reposts, commentaires, etc.)
 * - reload({ silent }) : recharge la première page
 * - loadMore() : charge la page suivante
 *
 * Le curseur reste chronologique (created_at / id) : la pagination ne change pas,
 * seul l'ordre d'affichage à l'intérieur de chaque page est classé.
 */
export function useCursorFeed({ onError } = {}) {
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const cursorRef = useRef(null);
  const busyRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Contexte de classement : utilisateur connecté + comptes suivis (table follows existante)
  const ctxRef = useRef({ userId: null, followed: new Set(), loadedFor: null });

  const loadContext = useCallback(async (force) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;

      if (!uid) {
        ctxRef.current = { userId: null, followed: new Set(), loadedFor: null };
        return ctxRef.current;
      }
      if (!force && ctxRef.current.loadedFor === uid) return ctxRef.current;

      const { data } = await supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", uid)
        .limit(1000);

      ctxRef.current = {
        userId: uid,
        followed: new Set((data || []).map((r) => r.followed_id)),
        loadedFor: uid,
      };
    } catch {
      // Sans contexte, le classement reste valable (engagement + fraîcheur)
    }
    return ctxRef.current;
  }, []);

  const load = useCallback(
    async ({ reset = false, silent = false } = {}) => {
      if (busyRef.current) return null;
      if (!reset && !cursorRef.current) return null;

      busyRef.current = true;
      if (reset && !silent) setLoading(true);
      if (!reset) setLoadingMore(true);

      try {
        const [{ rows, nextCursor }, ctx] = await Promise.all([
          fetchFeedPage({ cursor: reset ? null : cursorRef.current }),
          loadContext(reset),
        ]);

        const ranked = rankRows(rows, ctx);

        setPosts((prev) => {
          if (reset) return ranked;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...ranked.filter((r) => !seen.has(r.id))];
        });

        cursorRef.current = nextCursor;
        setHasMore(Boolean(nextCursor));
        return ranked;
      } catch (e) {
        onErrorRef.current?.(e);
        if (reset) {
          if (!silent) setPosts([]);
          setHasMore(false);
        }
        return null;
      } finally {
        busyRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [loadContext]
  );

  const reload = useCallback((opts) => load({ ...opts, reset: true }), [load]);
  const loadMore = useCallback(() => load({ reset: false }), [load]);

  return { posts, setPosts, hasMore, loading, loadingMore, reload, loadMore };
}
