import { supabase } from "../supabaseClient.js";

const ALLOWED = new Set([
  "impression","open","watch","complete","like","comment","share","save","hide"
]);

const OFFLINE_QUEUE_KEY = "baaro_offline_feed_events";

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

export async function flushOfflineEvents() {
  if (!navigator.onLine) return;
  const queue = getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      await supabase.rpc("record_feed_event", item);
    } catch {
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", flushOfflineEvents);
}

export async function recordFeedEvent(postId, eventType, durationSeconds = 0) {
  if (!postId || !ALLOWED.has(eventType)) return { data: null, error: null };

  const payload = {
    p_post_id: postId,
    p_event_type: eventType,
    p_duration_seconds: Math.max(0, Math.min(Number(durationSeconds) || 0, 86400)),
  };

  if (!navigator.onLine) {
    const queue = getOfflineQueue();
    queue.push(payload);
    saveOfflineQueue(queue);
    return { data: { offline: true }, error: null };
  }

  try {
    return await supabase.rpc("record_feed_event", payload);
  } catch (err) {
    const queue = getOfflineQueue();
    queue.push(payload);
    saveOfflineQueue(queue);
    return { data: null, error: err };
  }
}
