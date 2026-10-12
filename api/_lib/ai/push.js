/**
 * BAARO push helpers — Web Push (VAPID) + FCM
 * Importé depuis social.js (0 fichier api/ supplémentaire à la racine).
 *
 * Usage dans social.js :
 *   import { sendPushToUsers, processPushOutbox } from "./_lib/push.js";
 */
import webpush from "web-push";

const VAPID_PUBLIC =
  process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@baaro.app";
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || "";

function initWebPush() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    throw new Error("VAPID keys manquantes");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

async function userAllowsCategory(admin, userId, category) {
  if (!category) return true;
  const { data } = await admin
    .from("notification_preferences")
    .select("push_enabled, messages, social, live, earnings, wallet, marketing")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return true;
  if (data.push_enabled === false) return false;
  const earningsPref =
    data.earnings !== undefined ? data.earnings : data.wallet;
  switch (category) {
    case "message":
      return data.messages !== false;
    case "social":
      return data.social !== false;
    case "live":
      return data.live !== false;
    case "earnings":
    case "wallet":
      return earningsPref !== false;
    case "marketing":
      return data.marketing === true;
    default:
      return true;
  }
}

async function sendWebPush(subscriptionJson, payload) {
  let sub;
  try {
    sub =
      typeof subscriptionJson === "string"
        ? JSON.parse(subscriptionJson)
        : subscriptionJson;
  } catch {
    return { ok: false, error: "token web invalide" };
  }
  if (!sub?.endpoint) return { ok: false, error: "endpoint manquant" };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 60 * 60 * 12,
      urgency: payload.category === "message" ? "high" : "normal",
    });
    return { ok: true };
  } catch (err) {
    const status = err?.statusCode || err?.status;
    if (status === 410 || status === 404) {
      return { ok: false, dead: true, error: String(status) };
    }
    return { ok: false, error: err?.message || "webpush failed" };
  }
}

async function sendFcm(token, payload) {
  if (!FCM_SERVER_KEY) {
    return { ok: false, error: "FCM_SERVER_KEY absente" };
  }
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${FCM_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        priority: "high",
        notification: {
          title: payload.title,
          body: payload.body,
          sound: "default",
          click_action: "FCM_PLUGIN_ACTIVITY",
        },
        data: {
          url: payload.url || "/",
          category: payload.category || "",
          tag: payload.tag || "",
          ...(payload.data || {}),
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.failure === 1) {
      const errCode = json?.results?.[0]?.error;
      if (errCode === "NotRegistered" || errCode === "InvalidRegistration") {
        return { ok: false, dead: true, error: errCode };
      }
      return { ok: false, error: errCode || res.statusText };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Envoie une push à une liste d'utilisateurs.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ userIds: string[], title: string, body: string, url?: string, category?: string, tag?: string, sound?: string, data?: object }} opts
 */
export async function sendPushToUsers(admin, opts) {
  const title = String(opts.title || "").trim().slice(0, 80);
  const text = String(opts.body || "").trim().slice(0, 240);
  const url =
    typeof opts.url === "string" && opts.url.startsWith("/") ? opts.url : "/";
  let category = opts.category || null;
  if (category === "wallet") category = "earnings";
  const sound =
    typeof opts.sound === "string" && opts.sound.startsWith("/")
      ? opts.sound
      : "/sounds/baaro_pulse.mp3";
  const userIds = (opts.userIds || []).filter(
    (id) => typeof id === "string" && id.length > 10
  );

  if (!title || !text || !userIds.length) {
    return { ok: false, error: "title, body, userIds requis" };
  }

  let webPushReady = true;
  try {
    initWebPush();
  } catch {
    webPushReady = false;
  }

  const payload = {
    title,
    body: text,
    url,
    category,
    tag: opts.tag,
    sound,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    ...(opts.data && typeof opts.data === "object" ? { data: opts.data } : {}),
  };

  let sent = 0;
  let skipped = 0;
  const deadTokens = [];

  for (const uid of userIds.slice(0, 200)) {
    const allowed = await userAllowsCategory(admin, uid, category);
    if (!allowed) {
      skipped += 1;
      continue;
    }

    const { data: tokens, error } = await admin
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", uid);

    if (error || !tokens?.length) {
      skipped += 1;
      continue;
    }

    for (const row of tokens) {
      if (row.platform === "web") {
        if (!webPushReady) continue;
        const result = await sendWebPush(row.token, payload);
        if (result.ok) sent += 1;
        else if (result.dead) deadTokens.push(row.id);
      } else if (row.platform === "android" || row.platform === "ios") {
        const result = await sendFcm(row.token, payload);
        if (result.ok) sent += 1;
        else if (result.dead) deadTokens.push(row.id);
      }
    }
  }

  if (deadTokens.length) {
    await admin.from("push_tokens").delete().in("id", deadTokens);
  }

  return { ok: true, sent, skipped, pruned: deadTokens.length };
}

/**
 * Vide la file push_outbox (batch).
 */
export async function processPushOutbox(admin, { batch = 40 } = {}) {
  let webPushReady = true;
  try {
    initWebPush();
  } catch {
    webPushReady = false;
  }

  const { data: rows, error } = await admin
    .from("push_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batch);

  if (error) return { ok: false, error: error.message };
  if (!rows?.length) return { ok: true, processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const payload = {
      title: row.title,
      body: row.body,
      url: row.url || "/",
      category: row.category,
      sound: row.sound,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: row.payload || {},
    };

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", row.user_id);

    let anyOk = false;
    const dead = [];

    for (const t of tokens || []) {
      let result = { ok: false };
      if (t.platform === "web" && webPushReady) {
        result = await sendWebPush(t.token, payload);
      } else if (t.platform === "android" || t.platform === "ios") {
        result = await sendFcm(t.token, payload);
      }
      if (result.ok) anyOk = true;
      if (result.dead) dead.push(t.id);
    }

    if (dead.length) {
      await admin.from("push_tokens").delete().in("id", dead);
    }

    if (anyOk || !(tokens?.length)) {
      await admin
        .from("push_outbox")
        .update({
          status: anyOk ? "sent" : "skipped",
          processed_at: new Date().toISOString(),
          attempts: (row.attempts || 0) + 1,
        })
        .eq("id", row.id);
      if (anyOk) sent += 1;
    } else {
      const attempts = (row.attempts || 0) + 1;
      await admin
        .from("push_outbox")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: "no delivery",
          processed_at: attempts >= 5 ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { ok: true, processed: rows.length, sent, failed };
}
