/**
 * BAARO — Notifications push
 * Web Push (VAPID) + FCM HTTP v1 (Android/iOS)
 *
 * Tables utilisées :
 * - push_tokens
 * - notification_preferences
 *
 * Variables serveur :
 * - VAPID_PUBLIC_KEY ou VITE_VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (facultatif)
 * - FIREBASE_SERVICE_ACCOUNT (JSON complet)
 * - FCM_ANDROID_CHANNEL_ID (facultatif)
 *
 * Changements : les abonnements Web Push refusés (401/403, ex. ancienne clé
 * VAPID) et les jetons FCM SENDER_ID_MISMATCH sont maintenant supprimés.
 * Aucun changement SQL prévu par ce fichier.
 */

import webpush from "web-push";
import crypto from "node:crypto";

const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.VITE_VAPID_PUBLIC_KEY ||
  "";

const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@baaro.app";

const ANDROID_CHANNEL_ID =
  process.env.FCM_ANDROID_CHANNEL_ID || "baaro_notifications";

/** Son par défaut BAARO */
const DEFAULT_PUSH_SOUND = "/sounds/baaro_pulse.mp3";

let vapidReady = false;
let vapidChecked = false;

function initWebPush() {
  if (vapidChecked) return vapidReady;

  vapidChecked = true;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] Clés VAPID manquantes.");
    return false;
  }

  try {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC,
      VAPID_PRIVATE
    );

    vapidReady = true;
  } catch (error) {
    console.error("[push] Configuration VAPID invalide :", error.message);
  }

  return vapidReady;
}

/* ---------------- Préférences ---------------- */

function allowsCategory(prefs, category) {
  if (!prefs) return true;
  if (prefs.push_enabled === false) return false;

  const earnings =
    prefs.earnings !== undefined ? prefs.earnings : prefs.wallet;

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

async function loadPrefs(admin, userIds) {
  const map = new Map();

  if (!userIds.length) return map;

  const { data, error } = await admin
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);

  if (error) {
    console.warn("[push][prefs]", error.message);
    return map;
  }

  for (const row of data || []) {
    map.set(row.user_id, row);
  }

  return map;
}

async function loadTokens(admin, userIds) {
  const map = new Map();

  if (!userIds.length) return map;

  const { data, error } = await admin
    .from("push_tokens")
    .select("id, user_id, token, platform")
    .in("user_id", userIds);

  if (error) {
    console.warn("[push][tokens]", error.message);
    return map;
  }

  for (const row of data || []) {
    if (!map.has(row.user_id)) {
      map.get(row.user_id, []);
    }

    map.get(row.user_id).push(row);
  }

  return map;
}

/* ---------------- Validation des données ---------------- */

function safeNotificationUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "https://baaro.invalid");

    if (parsed.origin !== "https://baaro.invalid") {
      return "/";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function normalizeCategory(category) {
  if (typeof category !== "string") return null;
  return category === "wallet" ? "earnings" : category;
}

function buildPayload(opts = {}) {
  const extraData =
    opts.data && typeof opts.data === "object" && !Array.isArray(opts.data)
      ? { ...opts.data }
      : {};

  // Résolution propre du son BAARO
  const sound =
    (typeof opts.sound === "string" && opts.sound.trim()) ||
    (typeof extraData.sound === "string" && extraData.sound.trim()) ||
    DEFAULT_PUSH_SOUND;

  return {
    title: String(opts.title || "").trim().slice(0, 80),
    body: String(opts.body || "").trim().slice(0, 240),
    url: safeNotificationUrl(opts.url),
    category: normalizeCategory(opts.category),
    tag:
      typeof opts.tag === "string"
        ? opts.tag.slice(0, 100)
        : "baaro-notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    sound,
    data: {
      ...extraData,
      sound,
    },
  };
}

/* ---------------- Web Push ---------------- */

async function sendWebPush(subscriptionJson, payload) {
  if (!initWebPush()) {
    return {
      ok: false,
      error: "Clés VAPID manquantes ou invalides.",
    };
  }

  let subscription;

  try {
    subscription =
      typeof subscriptionJson === "string"
        ? JSON.parse(subscriptionJson)
        : subscriptionJson;
  } catch {
    return {
      ok: false,
      dead: true,
      error: "Jeton Web Push JSON invalide.",
    };
  }

  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://")
  ) {
    return {
      ok: false,
      dead: true,
      error: "Endpoint Web Push invalide.",
    };
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 12,
        urgency: payload.category === "message" ? "high" : "normal",
      }
    );

    return { ok: true };
  } catch (error) {
    const status = error?.statusCode || error?.status;

    if (
      status === 404 ||
      status === 410 ||
      status === 401 ||
      status === 403
    ) {
      return {
        ok: false,
        dead: true,
        error: String(status),
      };
    }

    return {
      ok: false,
      error: error?.message || "Échec Web Push.",
    };
  }
}

/* ---------------- FCM HTTP v1 ---------------- */

let cachedServiceAccount = null;

function getServiceAccount() {
  if (cachedServiceAccount !== null) {
    return cachedServiceAccount || null;
  }

  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";

    if (!raw) {
      cachedServiceAccount = false;
      return null;
    }

    const serviceAccount = JSON.parse(raw);

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        "Le JSON Firebase doit contenir project_id, client_email et private_key."
      );
    }

    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, "\n");

    cachedServiceAccount = serviceAccount;

    return serviceAccount;
  } catch (error) {
    console.error(
      "[push] FIREBASE_SERVICE_ACCOUNT invalide :",
      error.message
    );

    cachedServiceAccount = false;

    return null;
  }
}

let tokenCache = {
  value: null,
  exp: 0,
};

async function getFcmAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);

  if (tokenCache.value && tokenCache.exp - 60 > now) {
    return tokenCache.value;
  }

  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const header = encode({
    alg: "RS256",
    typ: "JWT",
  });

  const claims = encode({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);

  const signature = signer
    .sign(serviceAccount.private_key)
    .toString("base64url");

  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description ||
        result.error ||
        "Impossible d'obtenir le jeton OAuth FCM."
    );
  }

  tokenCache = {
    value: result.access_token,
    exp: now + (result.expires_in || 3600),
  };

  return tokenCache.value;
}

function toStringMap(value) {
  const result = {};

  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined || item === null) continue;

    result[String(key)] =
      typeof item === "string" ? item : JSON.stringify(item);
  }

  return result;
}

async function sendFcm(token, payload) {
  if (typeof token !== "string" || !token.trim()) {
    return {
      ok: false,
      dead: true,
      error: "Jeton FCM vide.",
    };
  }

  const serviceAccount = getServiceAccount();

  if (!serviceAccount) {
    return {
      ok: false,
      error: "FIREBASE_SERVICE_ACCOUNT absente ou invalide.",
    };
  }

  try {
    const accessToken = await getFcmAccessToken(serviceAccount);

    const data = toStringMap({
      ...(payload.data || {}),
      url: payload.url || "/",
      category: payload.category || "",
      tag: payload.tag || "",
      sound: payload.sound || DEFAULT_PUSH_SOUND,
    });

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        serviceAccount.project_id
      )}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data,
            android: {
              priority:
                payload.category === "message" ? "HIGH" : "NORMAL",
              notification: {
                tag: payload.tag || undefined,
                channel_id: ANDROID_CHANNEL_ID,
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
              },
              payload: {
                aps: {
                  sound: "default",
                },
              },
            },
          },
        }),
      }
    );

    if (response.ok) {
      return { ok: true };
    }

    const result = await response.json().catch(() => ({}));
    const status = result?.error?.status;
    const message =
      result?.error?.message || response.statusText;

    const errorCode = Array.isArray(result?.error?.details)
      ? result.error.details.find((detail) => detail?.errorCode)
          ?.errorCode
      : null;

    if (
      status === "NOT_FOUND" ||
      status === "UNREGISTERED" ||
      errorCode === "UNREGISTERED" ||
      errorCode === "SENDER_ID_MISMATCH"
    ) {
      return {
        ok: false,
        dead: true,
        error: errorCode || status,
      };
    }

    if (
      status === "INVALID_ARGUMENT" &&
      /registration token/i.test(message)
    ) {
      return {
        ok: false,
        dead: true,
        error: message,
      };
    }

    return {
      ok: false,
      error: message || "Échec FCM.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Erreur d'envoi FCM.",
    };
  }
}

/* ---------------- Envoi par lots ---------------- */

async function deliver(tokens, payload) {
  let sent = 0;

  const dead = [];
  const errors = [];

  for (let index = 0; index < tokens.length; index += 20) {
    const chunk = tokens.slice(index, index + 20);

    const results = await Promise.all(
      chunk.map((tokenRow) => {
        if (tokenRow.platform === "web") {
          return sendWebPush(tokenRow.token, payload);
        }

        if (
          tokenRow.platform === "android" ||
          tokenRow.platform === "ios"
        ) {
          return sendFcm(tokenRow.token, payload);
        }

        return Promise.resolve({
          ok: false,
          error: `Plateforme inconnue : ${tokenRow.platform}`,
        });
      })
    );

    results.forEach((result, resultIndex) => {
      if (result.ok) {
        sent += 1;
        return;
      }

      if (result.dead) {
        dead.push(chunk[resultIndex].id);
      } else if (result.error) {
        errors.push(result.error);
      }
    });
  }

  if (errors.length) {
    console.warn(
      "[push][deliver] Erreurs :",
      [...new Set(errors)].join(" | ")
    );
  }

  return {
    sent,
    dead: [...new Set(dead)],
  };
}

/* ---------------- API principale ---------------- */

/**
 * Envoie une notification aux utilisateurs ciblés.
 * Respecte leurs préférences et nettoie les jetons expirés.
 */
export async function sendPushToUsers(admin, opts = {}) {
  if (!admin) {
    return {
      ok: false,
      error: "Client Supabase admin requis.",
    };
  }

  const payload = buildPayload(opts);

  const userIds = [
    ...new Set(
      (Array.isArray(opts.userIds) ? opts.userIds : []).filter(
        (id) => typeof id === "string" && id.length > 10
      )
    ),
  ].slice(0, 500);

  if (!payload.title || !payload.body || !userIds.length) {
    return {
      ok: false,
      error: "title, body et userIds sont requis.",
    };
  }

  const [preferences, tokensByUser] = await Promise.all([
    loadPrefs(admin, userIds),
    loadTokens(admin, userIds),
  ]);

  let skipped = 0;
  const targets = [];

  for (const userId of userIds) {
    if (!allowsCategory(preferences.get(userId), payload.category)) {
      skipped += 1;
      continue;
    }

    const tokens = tokensByUser.get(userId);

    if (!tokens?.length) {
      skipped += 1;
      continue;
    }

    targets.push(...tokens);
  }

  const { sent, dead } = await deliver(targets, payload);

  let pruneError = null;

  if (dead.length) {
    const { error } = await admin
      .from("push_tokens")
      .delete()
      .in("id", dead);

    if (error) {
      pruneError = error.message;
      console.warn("[push] Nettoyage des jetons expirés :", error.message);
    }
  }

  return {
    ok: true,
    sent,
    skipped,
    pruned: dead.length,
    ...(pruneError ? { pruneError } : {}),
  };
}
