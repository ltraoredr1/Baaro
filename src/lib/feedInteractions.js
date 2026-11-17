import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { buildInteractionMap } from "./feedInteractionState.js";

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isMissingPostSharesCounter(error) {
  const message = String(error?.message || "");
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code) ||
    (/(get_post_share_counts|post_shares)/i.test(message) &&
      /(does not exist|not found|schema cache|could not find|undefined function|undefined table)/i.test(message));
}

export async function fetchFeedInteractions(postIds, userId) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const [likesResult, sharesResult, bookmarksResult] = await Promise.all([
    supabase.from("post_likes").select("post_id,user_id").in("post_id", ids),
    supabase.rpc("get_post_share_counts", { p_post_ids: ids }),
    isUuid(userId)
      ? supabase.from("post_bookmarks").select("post_id").eq("user_id", userId).in("post_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (likesResult.error) throw likesResult.error;
  if (sharesResult.error && !isMissingPostSharesCounter(sharesResult.error)) throw sharesResult.error;
  if (bookmarksResult.error) throw bookmarksResult.error;

  const map = buildInteractionMap({
    likes: likesResult.data || [],
    shares: sharesResult.error ? [] : sharesResult.data || [],
    bookmarks: bookmarksResult.data || [],
    userId,
  });
  return map;
}

export function useFeedInteractions(postIds, userId) {
  const [interactions, setInteractions] = useState(() => new Map());
  const key = [...new Set((postIds || []).filter(Boolean))].join(",");
  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setInteractions(new Map());
      return () => { cancelled = true; };
    }
    fetchFeedInteractions(key.split(","), userId)
      .then((next) => { if (!cancelled) setInteractions(next); })
      .catch(() => { if (!cancelled) setInteractions(new Map()); });
    return () => { cancelled = true; };
  }, [key, userId]);
  return interactions;
}
