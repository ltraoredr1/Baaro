import { supabase } from "../supabaseClient.js";
import { withRetry } from "./perf.js";

const PAGE_SIZE = 20;

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
          text,
          media_url,
          media_type,
          created_at,
          author_id,
          likes_count,
          comments_count,
          views_count,
          profiles:author_id ( display_name, handle, flag, avatar_url )
        `
        )
       .order("created_at", { ascending: false })
       .order("id", { ascending: false })
       .limit(pageSize);

      if (cursor?.created_at && cursor?.id) {
        q = q.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      } else if (cursor?.created_at) {
        q = q.lt("created_at", cursor.created_at);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = data || [];
      const nextCursor =
        rows.length === pageSize
         ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
          : null;

      return { rows, nextCursor };
    },
    { retries: 2, baseMs: 400 }
  );
}

export function createFeedLoader(fetchPage = fetchFeedPage) {
  return {
    firstPage() { return fetchPage({ cursor: null }); },
    nextPage(cursor) {
      if (!cursor) return Promise.resolve({ rows: [], nextCursor: null });
      return fetchPage({ cursor });
    },
  };
}
