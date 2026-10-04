import { supabase } from "../supabaseClient.js";

const ALLOWED = new Set([
  "impression","open","watch","complete","like","comment","share","save","hide"
]);

export async function recordFeedEvent(postId, eventType, durationSeconds = 0) {
  if (!postId || !ALLOWED.has(eventType)) return { data: null, error: null };
  return supabase.rpc("record_feed_event", {
    p_post_id: postId,
    p_event_type: eventType,
    p_duration_seconds: Math.max(0, Math.min(Number(durationSeconds) || 0, 86400)),
  });
}
