import { supabase } from "../supabaseClient.js";
import { withRetry } from "./perf.js";
import { FOLLOWS } from "../features/stories/constants.js";

// Nombre de posts chronologiques récupérés à chaque page, puis classés entre eux.
const PAGE_SIZE = 30;

const BASE_COLUMNS = `
  id,
  text,
  media_url,
  media_type,
  created_at,
  author_id,
  likes_count,
  reposts_count,
  comments_count,
  views_count,
  profiles:author_id ( display_name, handle, flag, avatar_url )
`;

// media_urls = plusieurs médias par publication (colonne facultative)
const COLUMNS_WITH_MEDIA_URLS = BASE_COLUMNS.replace("media_type,", "media_type,\n  media_urls,");

let useMediaUrls = true; // passe à false si la colonne n'existe pas dans la base

/* =========================================================
   CLASSEMENT
   Utilise uniquement des colonnes existantes de `posts` et
   la table des abonnements déjà utilisée par les stories.
   ========================================================= */

const FOLLOWING_TTL_MS = 5 * 60 * 1000;
let followingCache = { userId: null, at: 0, ids: new Set() };

async function getFollowingIds() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return { userId: null, ids: new Set() };

    if (followingCache.userId === userId && Date.now() - followingCache.at < FOLLOWING_TTL_MS) {
      return followingCache;
    }

    const { data, error } = await supabase
      .from(FOLLOWS.table)
      .select(FOLLOWS.following)
      .eq(FOLLOWS.follower, userId)
      .eq(FOLLOWS.statusColumn, FOLLOWS.accepted);
    if (error) throw error;

    followingCache = {
      userId,
      at: Date.now(),
      ids: new Set((data || []).map((r) => r[FOLLOWS.following])),
    };
    return followingCache;
  } catch {
    // Abonnements indisponibles : le classement continue sans ce critère
    return { userId: null, ids: new Set() };
  }
}

/** Score d'un post : engagement pondéré, dégradé avec l'âge, bonus abonnements et nouveauté. */
export function scorePost(post, { userId, following, now = Date.now() }) {
  const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);

  const engagement =
    (post.likes_count || 0) * 1 +
    (post.comments_count || 0) * 3 +
    (post.reposts_count || 0) * 4 +
    Math.log1p(post.views_count || 0) * 0.5;

  // Décroissance type « Hacker News » : l'engagement compte, mais le temps l'érode
  let score = (engagement + 1) / Math.pow(ageHours + 2, 1.5);

  if (post.author_id && following.has(post.author_id)) score *= 1.6; // personnes suivies
  if (userId && post.author_id === userId) score *= 1.2; // mes propres posts
  if (ageHours < 1) score += 0.6; // un nouveau post reste visible en haut

  return score;
}

export function rankRows(rows, ctx) {
  return rows
    .map((row) => ({ row, score: scorePost(row, ctx) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}

/* =========================================================
   PAGINATION
   Le curseur reste chronologique (created_at, id) : aucune
   publication n'est sautée ni répétée entre deux pages.
   Seul l'ordre à l'intérieur d'une page est classé.
   ========================================================= */

function buildQuery(columns, cursor, pageSize) {
  let q = supabase
    .from("posts")
    .select(columns)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize);

  if (cursor?.created_at && cursor?.id) {
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    );
  } else if (cursor?.created_at) {
    q = q.lt("created_at", cursor.created_at);
  }
  return q;
}

export async function fetchFeedPage({
  cursor = null,
  pageSize = PAGE_SIZE,
} = {}) {
  return withRetry(
    async () => {
      let { data, error } = await buildQuery(
        useMediaUrls ? COLUMNS_WITH_MEDIA_URLS : BASE_COLUMNS,
        cursor,
        pageSize
      );

      // Colonne media_urls absente : on réessaie sans elle (et on s'en souvient)
      if (error && useMediaUrls && /media_urls/i.test(error.message || "")) {
        useMediaUrls = false;
        ({ data, error } = await buildQuery(BASE_COLUMNS, cursor, pageSize));
      }
      if (error) throw error;

      const chronological = data || [];

      // Le curseur se calcule AVANT le classement, sur l'ordre chronologique
      const last = chronological[chronological.length - 1];
      const nextCursor =
        chronological.length === pageSize && last
          ? { created_at: last.created_at, id: last.id }
          : null;

      const { userId, ids } = await getFollowingIds();
      const rows = rankRows(chronological, { userId, following: ids });

      return { rows, nextCursor };
    },
    { retries: 2, baseMs: 400 }
  );
}

export function createFeedLoader(fetchPage = fetchFeedPage) {
  return {
    firstPage() {
      return fetchPage({ cursor: null });
    },
    nextPage(cursor) {
      if (!cursor) return Promise.resolve({ rows: [], nextCursor: null });
      return fetchPage({ cursor });
    },
  };
}
