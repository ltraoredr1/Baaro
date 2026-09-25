/**
 * BAARO — Notifications push (Web Push + Capacitor natif)
 * Ne plante jamais : tous les chemins sont protégés.
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

async function isNativePlatform() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isPushSupported() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {}
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState() {
  try {
    if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()) {
      return "default";
    }
  } catch {}
  if (!isPushSupported()) return "unsupported";
  try {
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

async function enableNativePush() {
  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive !== "granted") {
      return {
        ok: false,
        error: "Permission notifications refusée",
        permission: perm.receive,
      };
    }

    await PushNotifications.register();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          ok: true,
          permission: "granted",
          note: "Enregistrement lancé (token async)",
        });
      }, 8000);

      const onReg = async (token) => {
        clearTimeout(timeout);
        try {
          await PushNotifications.removeAllListeners();
        } catch {}

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          resolve({ ok: false, error: "Non authentifié" });
          return;
        }

        let platform = "android";
        try {
          const { Capacitor } = await import("@capacitor/core");
          platform = Capacitor.getPlatform?.() === "ios" ? "ios" : "android";
        } catch {}

        const { error } = await supabase.from("push_tokens").upsert(
          {
            user_id: user.id,
            token: token.value,
            platform,
            user_agent: navigator.userAgent?.slice(0, 200) || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,token" }
        );

        if (error) {
          console.error("push_tokens native upsert:", error);
          resolve({ ok: false, error: error.message });
          return;
        }

        resolve({ ok: true, permission: "granted" });
      };

      const onErr = (err) => {
        clearTimeout(timeout);
        console.error("Push register error:", err);
        resolve({
          ok: false,
          error: err?.error || err?.message || "Échec enregistrement push natif",
        });
      };

      PushNotifications.addListener("registration", onReg);
      PushNotifications.addListener("registrationError", onErr);
      PushNotifications.addListener("pushNotificationReceived", (n) => {
        console.log("[push] received", n);
      });
      PushNotifications.addListener("pushNotificationActionPerformed", (n) => {
        console.log("[push] action", n);
      });
    });
  } catch (e) {
    console.error("enableNativePush:", e);
    return {
      ok: false,
      error: e?.message || "Plugin push natif indisponible",
    };
  }
}

export async function enablePushNotifications() {
  try {
    if (await isNativePlatform()) {
      return await enableNativePush();
    }

    if (!isPushSupported()) {
      return {
        ok: false,
        error: "Notifications non supportées sur cet appareil",
      };
    }

    if (!VAPID_PUBLIC) {
      return {
        ok: false,
        error:
          "VITE_VAPID_PUBLIC_KEY manquante — génère les clés avec : npx web-push generate-vapid-keys",
      };
    }

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
    return { ok: false, error: e?.message || "Erreur activation push" };
  }
}

export async function disablePushNotifications() {
  try {
    if (await isNativePlatform()) {
      try {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );
        await PushNotifications.removeAllListeners();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("push_tokens")
            .delete()
            .eq("user_id", user.id)
            .in("platform", ["android", "ios"]);
        }
      } catch (e) {
        return { ok: false, error: e?.message || "Erreur désactivation native" };
      }
      return { ok: true };
    }

    if (!isPushSupported()) return { ok: true };

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
    return { ok: false, error: e?.message || "Erreur désactivation" };
  }
}

export async function pruneCurrentUserPushTokens() {
  if (!(await isNativePlatform()) && !isPushSupported()) {
    return { ok: true };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié" };

  if (await isNativePlatform()) {
    return { ok: true };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const current = await reg.pushManager.getSubscription();
    if (!current) return { ok: true };

    const currentToken = JSON.stringify(current.toJSON());
    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("platform", "web")
      .neq("token", currentToken);

    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message };
  }
}
