/**
 * File d'actions métier hors-ligne (like, follow, etc.).
 * Respecte le réglage offline_sync (localStorage baaro_settings_v23).
 */
import { supabase } from "../supabaseClient.js";
import { getSetting } from "./appSettings.js";

const QUEUE_KEY = "baaro_offline_actions_v1";
const MAX_QUEUE = 100;
const MAX_ATTEMPTS = 5;

const HANDLERS = {
  async like_post({ post_id }) {
    if (!post_id) throw new Error("post_id requis");
    const { error } = await supabase.from("post_likes").upsert(
      {
        post_id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
      },
      { onConflict: "post_id,user_id" }
    );
    if (error) throw error;
  },
  async unlike_post({ post_id }) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid || !post_id) return;
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", uid);
    if (error) throw error;
  },
  async follow_user({ followed_id }) {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid || !followed_id) return;
    const { error } = await supabase.from("follows").upsert(
      {
        follower_id: uid,
        followed_id,
        status: "accepted",
        is_friend: false,
      },
      { onConflict: "follower_id,followed_id" }
    );
    if (error) throw error;
  },
};

function isOfflineSyncEnabled() {
  try {
    return getSetting("offline_sync") !== false;
  } catch {
    return true;
  }
}

function loadQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    /* quota */
  }
}

/**
 * Enfile une action si offline (et offline_sync actif), sinon exécute tout de suite.
 * @param {string} type - clé dans HANDLERS
 * @param {object} payload
 */
export async function runOrEnqueue(type, payload = {}) {
  if (!HANDLERS[type]) {
    throw new Error(`Action offline inconnue: ${type}`);
  }

  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (offline && isOfflineSyncEnabled()) {
    const queue = loadQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      enqueued_at: Date.now(),
      attempts: 0,
    });
    saveQueue(queue);
    return { ok: true, offline: true, queued: true };
  }

  await HANDLERS[type](payload);
  return { ok: true, offline: false };
}

export async function flushOfflineActions() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { flushed: 0 };
  if (!isOfflineSyncEnabled()) return { flushed: 0 };

  const queue = loadQueue();
  if (!queue.length) return { flushed: 0 };

  const remaining = [];
  let flushed = 0;

  for (const item of queue) {
    const handler = HANDLERS[item.type];
    if (!handler) continue;
    if ((item.attempts || 0) >= MAX_ATTEMPTS) continue;
    try {
      await handler(item.payload || {});
      flushed += 1;
    } catch {
      remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
    }
  }

  saveQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export function getOfflineActionQueueSize() {
  return loadQueue().length;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushOfflineActions();
  });
}
