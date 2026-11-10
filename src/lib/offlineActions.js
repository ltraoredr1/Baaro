/**
 * File d'actions offline isolée par utilisateur.
 * Les erreurs locales/de stockage sont remontées : aucune action n'est annoncée
 * comme mise en file tant que son écriture n'a pas été vérifiée.
 */
import { supabase } from "../supabaseClient.js";
import { getSetting } from "./appSettings.js";
import { withOfflineQueueLock } from "./offlineQueueLock.js";
import { isTransientOfflineError } from "./offlineErrorPolicy.js";
import { OFFLINE_MAX_ATTEMPTS, retryDelayMs, validateOfflineRecord } from "../features/offline/offlineCore.js";
export { isTransientOfflineError } from "./offlineErrorPolicy.js";

const QUEUE_PREFIX = "baaro_offline_actions_v2:";
const MAX_QUEUE = 100;
const activeFlushes = new Map();
let retryTimer = null;

const HANDLERS = {
  async like_post({ post_id, user_id }) {
    if (!post_id || !user_id) throw new Error("post_id et user_id requis");
    const { error } = await supabase.from("post_likes").upsert(
      { post_id, user_id },
      { onConflict: "post_id,user_id" }
    );
    if (error) throw error;
  },
  async unlike_post({ post_id, user_id }) {
    if (!post_id || !user_id) throw new Error("post_id et user_id requis");
    const { error } = await supabase
      .from("post_likes")
      .delete()
      .eq("post_id", post_id)
      .eq("user_id", user_id);
    if (error) throw error;
  },
  async follow_user({ followed_id, user_id }) {
    await setFollowState(user_id, followed_id, true);
  },
  async unfollow_user({ followed_id, user_id }) {
    await setFollowState(user_id, followed_id, false);
  },
};

async function setFollowState(userId, targetId, wanted) {
  if (!userId || !targetId || userId === targetId) throw new Error("Cible d’abonnement invalide.");
  const { data, error } = await supabase.from("follows")
    .select("status")
    .eq("follower_id", userId)
    .eq("followed_id", targetId)
    .maybeSingle();
  if (error) throw error;
  const current = Boolean(data && (!data.status || data.status === "accepted"));
  if (current === wanted) return;
  const { error: toggleError } = await supabase.rpc("toggle_follow", { p_target: targetId });
  if (toggleError) throw toggleError;
}

function isOfflineSyncEnabled() {
  try { return getSetting("offline_sync") !== false; }
  catch { return true; }
}

function queueKey(userId) { return `${QUEUE_PREFIX}${userId}`; }
function loadQueue(userId) {
  if (!userId || typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(queueKey(userId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function saveQueue(userId, queue) {
  if (!userId || typeof localStorage === "undefined") throw new Error("Stockage offline indisponible.");
  if (queue.length > MAX_QUEUE) throw new Error("File offline pleine : synchronisez-la avant d’ajouter d’autres actions.");
  const key = queueKey(userId);
  const serialized = JSON.stringify(queue);
  try {
    localStorage.setItem(key, serialized);
    if (localStorage.getItem(key) !== serialized) throw new Error("La vérification du stockage a échoué.");
  } catch (error) {
    throw new Error(`Impossible de conserver l’action hors ligne : ${error?.message || "stockage indisponible"}`);
  }
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
}
async function enqueue(userId, type, payload) {
  if (!isOfflineSyncEnabled()) throw new Error("La synchronisation hors ligne est désactivée.");
  if (!userId) throw new Error("Connectez-vous pour conserver cette action hors ligne.");
  const item = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    user_id: userId,
    type,
    payload: { ...payload, user_id: userId },
    enqueued_at: Date.now(),
    attempts: 0,
    next_attempt_at: 0,
  };
  if (!(await validateOfflineRecord(type, item.attempts, item.payload))) {
    throw new Error("Action offline invalide ou trop volumineuse.");
  }
  await withOfflineQueueLock(`offline-actions:${userId}`, async () => {
    const queue = loadQueue(userId);
    if (queue.length >= MAX_QUEUE) throw new Error("File offline pleine : synchronisez-la avant d’ajouter d’autres actions.");
    queue.push(item);
    saveQueue(userId, queue);
  });
  return item;
}

/** Exécute immédiatement ou conserve une action à rejouer si le réseau échoue. */
export async function runOrEnqueue(type, payload = {}) {
  if (!HANDLERS[type]) throw new Error(`Action offline inconnue: ${type}`);
  const userId = await currentUserId();
  if (!userId) throw new Error("Connectez-vous pour effectuer cette action.");
  const action = { ...payload, user_id: userId };
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) {
    await enqueue(userId, type, action);
    return { ok: true, offline: true, queued: true };
  }
  try {
    await HANDLERS[type](action);
    return { ok: true, offline: false };
  } catch (error) {
    if (isOfflineSyncEnabled() && isTransientOfflineError(error)) {
      await enqueue(userId, type, action);
      return { ok: true, offline: true, queued: true, recoveredFromNetworkError: true };
    }
    throw error;
  }
}

function scheduleRetry(delay) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOfflineActions();
  }, delay);
}

async function performFlush() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { flushed: 0, remaining: 0, offline: true };
  if (!isOfflineSyncEnabled()) return { flushed: 0, remaining: 0, disabled: true };
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
    if (!item || item.user_id !== userId || !HANDLERS[item.type]) {
      remaining.push({ ...item, status: "dead", last_error: "invalid_or_mismatched_owner" });
      dead += 1;
      continue;
    }
    if (item.status === "dead" || (item.attempts || 0) >= OFFLINE_MAX_ATTEMPTS) {
      remaining.push({ ...item, status: "dead" });
      dead += 1;
      continue;
    }
    const waitMs = Math.max(0, Number(item.next_attempt_at || 0) - Date.now());
    if (waitMs > 0) {
      remaining.push(item);
      nextDelay = Math.min(nextDelay, waitMs);
      continue;
    }
    if (!(await validateOfflineRecord(item.type, item.attempts || 0, item.payload || {}))) {
      remaining.push({ ...item, status: "dead", last_error: "invalid_payload" });
      dead += 1;
      continue;
    }
    try {
      await HANDLERS[item.type](item.payload);
      flushed += 1;
    } catch (error) {
      const ownerAfterError = await currentUserId().catch(() => null);
      if (ownerAfterError !== userId) {
        remaining.push(item, ...queue.slice(index + 1));
        break;
      }
      const attempts = (item.attempts || 0) + 1;
      if (attempts >= OFFLINE_MAX_ATTEMPTS || !isTransientOfflineError(error)) {
        remaining.push({ ...item, attempts, status: "dead", last_error: String(error?.message || "sync_failed").slice(0, 180) });
        dead += 1;
      } else {
        const delay = await retryDelayMs(attempts - 1);
        remaining.push({ ...item, attempts, next_attempt_at: Date.now() + delay, last_error: String(error?.message || "network_error").slice(0, 180) });
        nextDelay = Math.min(nextDelay, delay);
      }
    }
  }
  saveQueue(userId, remaining);
  if (Number.isFinite(nextDelay)) scheduleRetry(nextDelay);
  return { flushed, remaining: remaining.length, dead };
}

export async function flushOfflineActions() {
  const userId = await currentUserId();
  if (!userId) return performFlush();
  if (activeFlushes.has(userId)) return activeFlushes.get(userId);
  const pending = withOfflineQueueLock(`offline-actions:${userId}`, performFlush)
    .finally(() => { if (activeFlushes.get(userId) === pending) activeFlushes.delete(userId); });
  activeFlushes.set(userId, pending);
  return pending;
}

export function getOfflineActionQueueSize(userId) {
  if (!userId) return 0;
  return loadQueue(userId).filter((item) => item?.status !== "dead").length;
}
export function getOfflineActionDeadLetterCount(userId) {
  if (!userId) return 0;
  return loadQueue(userId).filter((item) => item?.status === "dead").length;
}
export async function clearOfflineActionDeadLetters(userId) {
  if (!userId) return 0;
  return withOfflineQueueLock(`offline-actions:${userId}`, async () => {
    const queue = loadQueue(userId);
    const remaining = queue.filter((item) => item?.status !== "dead");
    saveQueue(userId, remaining);
    return queue.length - remaining.length;
  });
}
export function clearOfflineActionQueue(userId) {
  if (!userId || typeof localStorage === "undefined") return;
  try { localStorage.removeItem(queueKey(userId)); } catch {}
}
