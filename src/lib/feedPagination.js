/**
 * Pagination curseur du fil + retry réseau.
 * Place : src/lib/feedPagination.js
 *
 * Adapte le .select() si ton schéma posts/profiles diffère.
 */
import { supabase } from "../supabaseClient.js";
import { withRetry } from "./perf.js";

const PAGE_SIZE = 15;

/**
 * @param {{ cursor?: string|null, pageSize?: number }} opts
 * @returns {Promise<{ rows: array, nextCursor: string|null }>}
 */
export async function fetchFeedPage({
  cursor = null,
  pageSize = PAGE_SIZE,
} = {}) {
  return withRetry(
    async () => {
      let q = supabase
        .from("posts")
        .select(
          `
          id,
          content,
          media_url,
          created_at,
          author_id,
          likes_count,
          profiles:author_id ( username, avatar_url, display_name )
        `
        )
        .order("created_at", { ascending: false })
        .limit(pageSize);

      if (cursor) {
        q = q.lt("created_at", cursor);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      const nextCursor =
        rows.length === pageSize ? rows[rows.length - 1].created_at : null;

      return { rows, nextCursor };
    },
    { retries: 2, baseMs: 400 }
  );
}

/**
 * Chargeur réutilisable (first / next page).
 */
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
