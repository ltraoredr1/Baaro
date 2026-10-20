import { supabase } from "../supabaseClient.js";

const ALLOWED = new Set([
  "impression",
  "open",
  "watch",
  "complete",
  "like",
  "comment",
  "share",
  "save",
  "hide",
]);

const OFFLINE_QUEUE_KEY = "baaro_offline_feed_events";
const MAX_QUEUE = 200;
const MAX_ATTEMPTS = 5;

function getOfflineQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify(queue.slice(-MAX_QUEUE))
    );
  } catch {
    /* quota */
  }
}

function enqueue(payload) {
  const queue = getOfflineQueue();
  const key = `${payload.p_post_id}:${payload.p_event_type}:${payload.p_duration_seconds}`;
  // Dédup simple : même event dans la fenêtre récente
  const exists = queue.some(
    (item) =>
      item.p_post_id === payload.p_post_id &&
      item.p_event_type === payload.p_event_type &&
      item.p_duration_seconds === payload.p_duration_seconds
  );
  if (exists) return;
  queue.push({
    ...payload,
    _enqueued_at: Date.now(),
    _attempts: 0,
  });
  saveOfflineQueue(queue);
}

export async function flushOfflineEvents() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const queue = getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    const attempts = Number(item._attempts || 0);
    if (attempts >= MAX_ATTEMPTS) continue; // abandon après N essais
    try {
      const { p_post_id, p_event_type, p_duration_seconds } = item;
      await supabase.rpc("record_feed_event", {
        p_post_id,
        p_event_type,
        p_duration_seconds,
      });
    } catch {
      remaining.push({ ...item, _attempts: attempts + 1 });
    }
  }
  saveOfflineQueue(remaining);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushOfflineEvents();
  });
}

export async function recordFeedEvent(
  postId,
  eventType,
  durationSeconds = 0
) {
  if (!postId || !ALLOWED.has(eventType)) return { data: null, error: null };

  const payload = {
    p_post_id: postId,
    p_event_type: eventType,
    p_duration_seconds: Math.max(
      0,
      Math.min(Number(durationSeconds) || 0, 86400)
    ),
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueue(payload);
    return { data: { offline: true }, error: null };
  }

  try {
    return await supabase.rpc("record_feed_event", payload);
  } catch (err) {
    enqueue(payload);
    return { data: null, error: err };
  }
}
