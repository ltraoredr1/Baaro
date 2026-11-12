/**
 * BAARO — Notifications push
 * Web Push (VAPID) + FCM HTTP v1 (Android/iOS)
 *
 * Tables utilisées : push_tokens, notification_preferences,
 * push_notification_jobs et push_notification_dead_letters.
 *
 * Variables serveur :
 * - VAPID_PUBLIC_KEY ou VITE_VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (facultatif)
 * - FIREBASE_SERVICE_ACCOUNT (JSON complet)
 * - FCM_ANDROID_CHANNEL_ID (facultatif)
 *
 * Les envois sont acceptés dans une file durable puis traités par le cron.
 */

import webpush from "web-push";
import crypto from "node:crypto";
import {
  loadPrefs,
  selectNotificationTargets,
} from "./push-preferences.js";
import {
  enqueuePushNotifications,
  processPushQueue as processQueue,
} from "./push-queue.js";
import {
  applyWebSound,
  fcmSoundFields,
  readSoundPreference,
} from "./push-sounds.js";

const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.VITE_VAPID_PUBLIC_KEY ||
  "";

const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@baaro.app";

const ANDROID_CHANNEL_ID =
  process.env.FCM_ANDROID_CHANNEL_ID || "baaro_notifications_v2";

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

async function loadTokens(admin, userIds) {
  const map = new Map();

  if (!userIds.length) return { tokensByUser: map, error: null };

  try {
    const { data, error } = await admin
      .from("push_tokens")
      .select("id, user_id, token, platform")
      .in("user_id", userIds);

    if (error) return { tokensByUser: map, error };

    for (const row of data || []) {
      if (!map.has(row.user_id)) {
        map.set(row.user_id, []);
      }
      map.get(row.user_id).push(row);
    }
    return { tokensByUser: map, error: null };
  } catch (error) {
    return { tokensByUser: map, error };
  }
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

async function sendFcm(token, payload, soundPreference) {
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

    // Son : celui choisi par l'utilisateur (préférence synchronisée), sinon
    // comportement historique. Voir api/_lib/push-sounds.js.
    const soundFields = fcmSoundFields(soundPreference);
    const androidChannelId = soundPreference?.synced
      ? soundFields.androidChannelId
      : ANDROID_CHANNEL_ID;

    const data = toStringMap({
      ...(payload.data || {}),
      url: payload.url || "/",
      category: payload.category || "",
      tag: payload.tag || "",
      sound: soundPreference?.synced
        ? soundPreference.silent
          ? "none"
          : soundPreference.soundId
        : payload.sound || DEFAULT_PUSH_SOUND,
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
                payload.category === "message" || payload.category === "live"
                  ? "HIGH"
                  : "NORMAL",
              notification: {
                tag: payload.tag || undefined,
                // Android 8+ : le son appartient au canal (un canal par son
                // + un canal muet). `sound` ne sert qu'à Android < 8.
                channel_id: androidChannelId,
                sound: soundFields.androidSound,
              },
            },
            apns: {
              headers: {
                "apns-priority": "10",
              },
              payload: {
                // Sans clé `sound`, iOS n'émet aucun son (mode silencieux).
                aps: soundFields.apnsSound
                  ? { sound: soundFields.apnsSound }
                  : {},
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

/* ---------------- Envoi et file persistante ---------------- */

/**
 * `context.preferences` est la ligne notification_preferences de
 * l'utilisateur (fournie par la file) : elle décide du son par plateforme.
 */
async function sendToken(tokenRow, payload, context = {}) {
  const soundPreference = readSoundPreference(context?.preferences);

  if (tokenRow.platform === "web") {
    return sendWebPush(tokenRow.token, applyWebSound(payload, soundPreference));
  }
  if (tokenRow.platform === "android" || tokenRow.platform === "ios") {
    return sendFcm(tokenRow.token, payload, soundPreference);
  }
  return {
    ok: false,
    dead: true,
    error: `Plateforme inconnue : ${tokenRow.platform}`,
  };
}

/** Traite un lot persisté ; les leases expirées sont récupérées par le RPC. */
export async function processPushNotificationQueue(admin, options = {}) {
  if (!admin) {
    return { ok: false, error: "Client Supabase admin requis.", claimed: 0 };
  }
  return processQueue(admin, sendToken, options);
}

/* ---------------- API principale ---------------- */

/**
 * Place une notification durablement dans la file pour chaque appareil cible.
 * `ok: true` signifie ici que la file a accepté l'envoi, pas que l'appareil
 * l'a déjà reçue. Utiliser `idempotencyKey` pour rendre un appel rejouable.
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

  const [prefsResult, tokensResult] = await Promise.all([
    loadPrefs(admin, userIds),
    loadTokens(admin, userIds),
  ]);
  if (tokensResult.error) {
    console.warn("[push][tokens]", tokensResult.error.message);
    return {
      ok: false,
      error: "Impossible de récupérer les appareils de notification.",
    };
  }
  const selection = selectNotificationTargets({
    userIds,
    prefsResult,
    tokensByUser: tokensResult.tokensByUser,
    category: payload.category,
  });
  if (selection.error) {
    console.warn("[push][prefs]", selection.error.message);
    return {
      ok: false,
      error: "Impossible de vérifier les préférences de notification.",
    };
  }
  if (!selection.targets.length) {
    return {
      ok: true,
      deliveryStatus: "skipped",
      accepted: 0,
      queued: 0,
      sent: 0,
      skipped: selection.skipped,
    };
  }

  const idempotencyKey =
    typeof opts.idempotencyKey === "string" &&
    opts.idempotencyKey.trim().length > 0 &&
    opts.idempotencyKey.length <= 200
      ? opts.idempotencyKey.trim()
      : crypto.randomUUID();
  const enqueueResult = await enqueuePushNotifications(
    admin,
    selection.targets,
    payload,
    idempotencyKey,
  );
  if (!enqueueResult.ok) {
    console.error(
      "[push][queue] Impossible d'enregistrer les jobs :",
      enqueueResult.error?.message || enqueueResult.error,
    );
    return {
      ok: false,
      error: "Impossible d'enregistrer les notifications dans la file.",
    };
  }

  let deliveryStatus = "unknown";
  if (enqueueResult.queued > 0) deliveryStatus = "queued";
  else if (enqueueResult.sent > 0) deliveryStatus = "sent";
  else if (enqueueResult.deadLettered > 0) deliveryStatus = "dead";
  else if (enqueueResult.cancelled > 0) deliveryStatus = "cancelled";
  const acceptedForDelivery = enqueueResult.queued > 0 || enqueueResult.sent > 0;

  return {
    ok: acceptedForDelivery,
    deliveryStatus,
    batchId: idempotencyKey,
    accepted: enqueueResult.accepted,
    queued: enqueueResult.queued,
    sent: enqueueResult.sent,
    deadLettered: enqueueResult.deadLettered,
    skipped: selection.skipped,
    ...(!acceptedForDelivery
      ? { error: "Aucun job en attente ou confirmé; consulter la dead-letter queue." }
      : {}),
  };
}
