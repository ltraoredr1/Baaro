/**
 * BAARO push helpers — Web Push (VAPID) + FCM HTTP v1
 * Aucun changement SQL requis.
 * Env requis pour Android/iOS : FIREBASE_SERVICE_ACCOUNT (JSON complet du compte de service)
 */
import webpush from "web-push";
import crypto from "node:crypto";

const VAPID_PUBLIC =
  process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@baaro.app";

let vapidReady = null;
function initWebPush() {
  if (vapidReady !== null) return vapidReady;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
  return true;
}

/* ---------------- Préférences ---------------- */

function allowsCategory(prefs, category) {
  if (!prefs) return true;
  if (prefs.push_enabled === false) return false;
  const earnings = prefs.earnings !== undefined ? prefs.earnings : prefs.wallet;
  switch (category) {
    case "message":
      return prefs.messages !== false;
    case "social":
      return prefs.social !== false;
    case "live":
      return prefs.live !== false;
    case "earnings":
    case "wallet":
      return earnings !== false;
    case "marketing":
      return prefs.marketing === true;
    default:
      return true;
  }
}

// select("*") : pas d'erreur si une colonne n'existe pas
async function loadPrefs(admin, userIds) {
  const map = new Map();
  if (!userIds.length) return map;
  const { data, error } = await admin
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);
  if (error) console.warn("[push][prefs]", error.message);
  for (const row of data || []) map.set(row.user_id, row);
  return map;
}

async function loadTokens(admin, userIds) {
  const map = new Map();
  if (!userIds.length) return map;
  const { data, error } = await admin
    .from("push_tokens")
    .select("id, user_id, token, platform")
    .in("user_id", userIds);
  if (error) console.warn("[push][tokens]", error.message);
  for (const row of data || []) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(row);
  }
  return map;
}

/* ---------------- Web Push ---------------- */

async function sendWebPush(subscriptionJson, payload) {
  if (!initWebPush()) return { ok: false, error: "VAPID keys manquantes" };
  let sub;
  try {
    sub =
      typeof subscriptionJson === "string"
        ? JSON.parse(subscriptionJson)
        : subscriptionJson;
  } catch {
    return { ok: false, dead: true, error: "token web invalide" };
  }
  if (!sub?.endpoint) return { ok: false, dead: true, error: "endpoint manquant" };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 60 * 60 * 12,
      urgency: payload.category === "message" ? "high" : "normal",
    });
    return { ok: true };
  } catch (err) {
    const status = err?.statusCode || err?.status;
    if (status === 410 || status === 404) return { ok: false, dead: true, error: String(status) };
    return { ok: false, error: err?.message || "webpush failed" };
  }
}

/* ---------------- FCM HTTP v1 ---------------- */

let cachedSA = null;
function getServiceAccount() {
  if (cachedSA !== null) return cachedSA || null;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
    cachedSA = raw ? JSON.parse(raw) : false;
    if (cachedSA && cachedSA.private_key) {
      cachedSA.private_key = cachedSA.private_key.replace(/\\n/g, "\n");
    }
  } catch (e) {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT invalide:", e.message);
    cachedSA = false;
  }
  return cachedSA || null;
}

let tokenCache = { value: null, exp: 0 };
async function getFcmAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.value && tokenCache.exp - 60 > now) return tokenCache.value;

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key).toString("base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || "oauth FCM impossible");
  }
  tokenCache = { value: json.access_token, exp: now + (json.expires_in || 3600) };
  return tokenCache.value;
}

function toStringMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function sendFcm(token, payload) {
  const sa = getServiceAccount();
  if (!sa) return { ok: false, error: "FIREBASE_SERVICE_ACCOUNT absente" };
  try {
    const accessToken = await getFcmAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: toStringMap({
              url: payload.url || "/",
              category: payload.category || "",
              tag: payload.tag || "",
              ...(payload.data || {}),
            }),
            android: {
              priority: payload.category === "message" ? "HIGH" : "NORMAL",
              notification: { tag: payload.tag || undefined },
            },
            apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
          },
        }),
      }
    );
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    const status = json?.error?.status;
    const msg = json?.error?.message || res.statusText;
    if (status === "NOT_FOUND" || status === "UNREGISTERED") {
      return { ok: false, dead: true, error: status };
    }
    if (status === "INVALID_ARGUMENT" && /registration token/i.test(msg)) {
      return { ok: false, dead: true, error: msg };
    }
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ---------------- Envoi vers une liste de tokens (parallèle) ---------------- */

async function deliver(tokens, payload) {
  let sent = 0;
  const dead = [];
  const errors = [];
  for (let i = 0; i < tokens.length; i += 20) {
    const chunk = tokens.slice(i, i + 20);
    const results = await Promise.all(
      chunk.map((t) => {
        if (t.platform === "web") return sendWebPush(t.token, payload);
        if (t.platform === "android" || t.platform === "ios") return sendFcm(t.token, payload);
        return Promise.resolve({ ok: false, error: "plateforme inconnue" });
      })
    );
    results.forEach((r, idx) => {
      if (r.ok) sent += 1;
      else {
        if (r.dead) dead.push(chunk[idx].id);
        else if (r.error) errors.push(r.error);
      }
    });
  }
  if (errors.length) console.warn("[push][deliver] erreurs:", [...new Set(errors)].join(" | "));
  return { sent, dead };
}

function buildPayload(opts) {
  const url = typeof opts.url === "string" && opts.url.startsWith("/") ? opts.url : "/";
  let category = opts.category || null;
  if (category === "wallet") category = "earnings";
  return {
    title: String(opts.title || "").trim().slice(0, 80),
    body: String(opts.body || "").trim().slice(0, 240),
    url,
    category,
    tag: opts.tag,
    sound:
      typeof opts.sound === "string" && opts.sound.startsWith("/")
        ? opts.sound
        : "/sounds/baaro_pulse.mp3",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    ...(opts.data && typeof opts.data === "object" ? { data: opts.data } : {}),
  };
}

/**
 * Envoie une push à une liste d'utilisateurs (préférences respectées).
 */
export async function sendPushToUsers(admin, opts) {
  const payload = buildPayload(opts);
  const userIds = [
    ...new Set((opts.userIds || []).filter((id) => typeof id === "string" && id.length > 10)),
  ].slice(0, 500);

  if (!payload.title || !payload.body || !userIds.length) {
    return { ok: false, error: "title, body, userIds requis" };
  }

  const [prefs, tokensByUser] = await Promise.all([
    loadPrefs(admin, userIds),
    loadTokens(admin, userIds),
  ]);

  let skipped = 0;
  const targets = [];
  for (const uid of userIds) {
    if (!allowsCategory(prefs.get(uid), payload.category)) {
      skipped += 1;
      continue;
    }
    const tokens = tokensByUser.get(uid);
    if (!tokens?.length) {
      skipped += 1;
      continue;
    }
    targets.push(...tokens);
  }

  const { sent, dead } = await deliver(targets, payload);
  if (dead.length) await admin.from("push_tokens").delete().in("id", dead);

  return { ok: true, sent, skipped, pruned: dead.length };
}
