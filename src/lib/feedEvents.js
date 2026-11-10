import { supabase } from "../supabaseClient.js";
import { getSetting } from "./appSettings.js";
import { withOfflineQueueLock } from "./offlineQueueLock.js";
import { isTransientOfflineError } from "./offlineErrorPolicy.js";

const ALLOWED = new Set(["impression", "open", "watch", "complete", "like", "comment", "share", "save", "hide"]);
const QUEUE_PREFIX = "baaro_offline_feed_events_v2:";
const MAX_QUEUE = 200;
const MAX_ATTEMPTS = 5;
const activeFlushes = new Map();
let retryTimer = null;

function syncEnabled() {
  try { return getSetting("offline_sync") !== false; } catch { return true; }
}
function key(userId) { return `${QUEUE_PREFIX}${userId}`; }
function loadQueue(userId) {
  if (!userId || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveQueue(userId, queue) {
  if (!userId || typeof localStorage === "undefined") throw new Error("Stockage offline indisponible.");
  if (queue.length > MAX_QUEUE) throw new Error("File des événements offline pleine.");
  const storageKey = key(userId);
  const raw = JSON.stringify(queue);
  try {
    localStorage.setItem(storageKey, raw);
    if (localStorage.getItem(storageKey) !== raw) throw new Error("La vérification du stockage a échoué.");
  } catch (error) {
    throw new Error(`Événement non conservé : ${error?.message || "stockage indisponible"}`);
  }
}
async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
}
function schedule(delay) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; void flushOfflineEvents(); }, delay);
}
async function enqueue(userId, payload) {
  if (!syncEnabled()) throw new Error("La synchronisation hors ligne est désactivée.");
  if (!userId) throw new Error("Connectez-vous pour conserver cet événement.");
  await withOfflineQueueLock(`offline-feed-events:${userId}`, async () => {
    const queue = loadQueue(userId);
    if (queue.length >= MAX_QUEUE) throw new Error("File des événements offline pleine : synchronisez-la avant de continuer.");
    queue.push({
      ...payload,
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      user_id: userId,
      enqueued_at: Date.now(),
      attempts: 0,
      next_attempt_at: 0,
    });
    saveQueue(userId, queue);
  });
}

async function performFlush() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { flushed: 0, remaining: 0, offline: true };
  if (!syncEnabled()) return { flushed: 0, remaining: 0, disabled: true };
  const userId = await currentUserId();
  if (!userId) return { flushed: 0, remaining: 0, signedOut: true };
  const queue = loadQueue(userId);
  if (!queue.length) return { flushed: 0, remaining: 0, dead: 0 };
  const remaining = [];
  let flushed = 0;
  let dead = 0;
  let nextDelay = Infinity;
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    const liveUserId = await currentUserId().catch(() => null);
    if (liveUserId !== userId) {
      remaining.push(...queue.slice(index));
      break;
    }
    if (!item || item.user_id !== userId || !ALLOWED.has(item.p_event_type) || !item.p_post_id) {
      remaining.push({ ...item, status: "dead", last_error: "invalid_or_mismatched_owner" });
      dead += 1;
      continue;
    }
    if (item.status === "dead" || (item.attempts || 0) >= MAX_ATTEMPTS) {
      remaining.push({ ...item, status: "dead" });
      dead += 1;
      continue;
    }
    const wait = Math.max(0, Number(item.next_attempt_at || 0) - Date.now());
    if (wait) { remaining.push(item); nextDelay = Math.min(nextDelay, wait); continue; }
    try {
      const { error } = await supabase.rpc("record_feed_event", {
        p_post_id: item.p_post_id,
        p_event_type: item.p_event_type,
        p_duration_seconds: item.p_duration_seconds,
      });
      if (error) throw error;
      flushed += 1;
    } catch (error) {
      const ownerAfterError = await currentUserId().catch(() => null);
      if (ownerAfterError !== userId) {
        remaining.push(item, ...queue.slice(index + 1));
        break;
      }
      const attempts = (item.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS || !isTransientOfflineError(error)) {
        remaining.push({ ...item, attempts, status: "dead", last_error: String(error?.message || "sync_failed").slice(0, 180) });
        dead += 1;
      } else {
        const baseDelay = Math.min(300_000, 1_000 * (2 ** (attempts - 1)));
        const delay = Math.round(baseDelay * (0.85 + Math.random() * 0.3));
        remaining.push({ ...item, attempts, next_attempt_at: Date.now() + delay, last_error: String(error?.message || "network_error").slice(0, 180) });
        nextDelay = Math.min(nextDelay, delay);
      }
    }
  }
  saveQueue(userId, remaining);
  if (Number.isFinite(nextDelay)) schedule(nextDelay);
  return { flushed, remaining: remaining.length, dead };
}

export async function flushOfflineEvents() {
  const userId = await currentUserId();
  if (!userId) return performFlush();
  if (activeFlushes.has(userId)) return activeFlushes.get(userId);
  const pending = withOfflineQueueLock(`offline-feed-events:${userId}`, performFlush)
    .finally(() => { if (activeFlushes.get(userId) === pending) activeFlushes.delete(userId); });
  activeFlushes.set(userId, pending);
  return pending;
}

export async function recordFeedEvent(postId, eventType, durationSeconds = 0) {
  if (!postId || !ALLOWED.has(eventType)) return { data: null, error: new Error("Événement feed invalide.") };
  const payload = {
    p_post_id: postId,
    p_event_type: eventType,
    p_duration_seconds: Math.max(0, Math.min(Number(durationSeconds) || 0, 86400)),
  };
  let userId;
  try { userId = await currentUserId(); }
  catch (error) { return { data: null, error }; }
  if (!userId) return { data: null, error: new Error("Aucun compte actif pour associer cet événement.") };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    try { await enqueue(userId, payload); return { data: { offline: true }, error: null }; }
    catch (error) { return { data: null, error }; }
  }
  try {
    const result = await supabase.rpc("record_feed_event", payload);
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    if (syncEnabled() && isTransientOfflineError(error)) {
      try { await enqueue(userId, payload); return { data: { offline: true, queued: true }, error: null }; }
      catch (storageError) { return { data: null, error: storageError }; }
    }
    return { data: null, error };
  }
}

export function getOfflineEventQueueSize(userId) {
  if (!userId) return 0;
  return loadQueue(userId).filter((item) => item?.status !== "dead").length;
}
export function getOfflineEventDeadLetterCount(userId) {
  if (!userId) return 0;
  return loadQueue(userId).filter((item) => item?.status === "dead").length;
}
export function getOfflineEventDeadLetters(userId) {
  if (!userId) return [];
  return loadQueue(userId).filter((item) => item?.status === "dead");
}
export async function retryOfflineEventDeadLetters(userId) {
  if (!userId) return 0;
  return withOfflineQueueLock(`offline-feed-events:${userId}`, async () => {
    const queue = loadQueue(userId);
    let retried = 0;
    const next = queue.map((item) => {
      if (item?.status !== "dead") return item;
      retried += 1;
      return { ...item, status: "pending", attempts: 0, next_attempt_at: 0, last_error: null };
    });
    saveQueue(userId, next);
    return retried;
  });
}
export async function clearOfflineEventDeadLetters(userId) {
  if (!userId) return 0;
  return withOfflineQueueLock(`offline-feed-events:${userId}`, async () => {
    const queue = loadQueue(userId);
    const remaining = queue.filter((item) => item?.status !== "dead");
    saveQueue(userId, remaining);
    return queue.length - remaining.length;
  });
}
export function clearOfflineEventQueue(userId) {
  if (!userId || typeof localStorage === "undefined") return;
  try { localStorage.removeItem(key(userId)); } catch {}
}
