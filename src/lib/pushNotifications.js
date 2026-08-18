/**
 * BAARO — Fondation notifications push (Web Push)
 *
 * Prérequis :
 * 1. Générer une paire de clés VAPID :
 *    npx web-push generate-vapid-keys
 * 2. VITE_VAPID_PUBLIC_KEY=... dans .env / Vercel
 * 3. Exécuter supabase/013_push_tokens.sql
 * 4. Service worker capable de recevoir push (étendre service-worker.js)
 *
 * Sans VAPID configuré, requestPermission() explique et ne plante pas.
 */

import { supabase } from "../supabaseClient";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission; // granted | denied | default
}

/**
 * Demande la permission et enregistre le token dans Supabase.
 * @returns {{ ok: boolean, error?: string, permission?: string }}
 */
export async function enablePushNotifications() {
  if (!isPushSupported()) {
    return { ok: false, error: "Notifications non supportées sur cet appareil" };
  }

  if (!VAPID_PUBLIC) {
    return {
      ok: false,
      error:
        "VITE_VAPID_PUBLIC_KEY manquante — génère les clés avec : npx web-push generate-vapid-keys",
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "Permission refusée", permission };
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const tokenJson = JSON.stringify(subscription.toJSON());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Non authentifié" };
    }

    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        token: tokenJson,
        platform: "web",
        user_agent: navigator.userAgent?.slice(0, 200) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" }
    );

    if (error) {
      console.error("push_tokens upsert:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, permission: "granted" };
  } catch (e) {
    console.error("enablePushNotifications:", e);
    return { ok: false, error: e.message || "Erreur activation push" };
  }
}

/**
 * Désactive et supprime le token local + en base.
 */
export async function disablePushNotifications() {
  if (!isPushSupported()) return { ok: true };

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const tokenJson = JSON.stringify(subscription.toJSON());
      await subscription.unsubscribe();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("push_tokens")
          .delete()
          .eq("user_id", user.id)
          .eq("token", tokenJson);
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
