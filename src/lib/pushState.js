import { useState, useEffect, useCallback } from "react";
import {
  isPushSupported,
  getPermissionStateAsync,
  isPushOptedOut,
  enablePushNotifications,
  disablePushNotifications,
  syncPushForCurrentUser,
} from "./pushNotifications.js";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "./notificationPreferences.js";
import {
  loadLocalSettings,
  saveLocalSettings,
  broadcastSettings,
} from "./appSettings.js";

/**
 * BAARO — logique centrale des notifications push.
 *
 *  - permission système + désactivation volontaire = état de CET appareil
 *  - push_enabled (serveur)                         = interrupteur général du compte
 *  - notif_push (réglages, local)                   = reflet calculé, jamais saisi
 *
 * Notification reçue = appareil actif ET compte actif.
 */

export const PUSH_STATE_EVENT = "baaro:push-state";
const OPT_OUT_KEY = "baaro_push_disabled";

function emit() {
  try {
    window.dispatchEvent(new CustomEvent(PUSH_STATE_EVENT));
  } catch {
    /* ignore */
  }
}

/** À appeler quand une autre partie de l'app change un état push. */
export const notifyPushStateChanged = emit;

/** notif_push suit l'état réel ; il n'est plus une préférence indépendante. */
function mirrorToSettings(effective) {
  try {
    const current = loadLocalSettings();
    if (current.notif_push === effective) return;
    const next = { ...current, notif_push: effective };
    saveLocalSettings(next);
    broadcastSettings(next);
  } catch {
    /* ignore */
  }
}

/**
 * reason : null (tout est actif) | "unsupported" | "denied" | "permission"
 *        | "optedOut" | "accountOff"
 */
export async function getPushState() {
  const supported = isPushSupported();
  const permission = supported ? await getPermissionStateAsync() : "unsupported";
  const optedOut = isPushOptedOut();

  let accountEnabled = true;
  try {
    const prefs = await getNotificationPreferences();
    accountEnabled = prefs?.data?.push_enabled !== false;
  } catch {
    /* repli : on considère le compte actif */
  }

  const deviceEnabled = supported && permission === "granted" && !optedOut;
  const effective = deviceEnabled && accountEnabled;

  let reason = null;
  if (!supported) reason = "unsupported";
  else if (permission === "denied") reason = "denied";
  else if (permission !== "granted") reason = "permission";
  else if (optedOut) reason = "optedOut";
  else if (!accountEnabled) reason = "accountOff";

  mirrorToSettings(effective);

  return {
    supported,
    permission,
    optedOut,
    accountEnabled,
    deviceEnabled,
    effective,
    reason,
  };
}

/** Active les notifications sur cet appareil (et réactive le compte si besoin). */
export async function enablePush() {
  const res = await enablePushNotifications();
  if (res.ok) {
    const saved = await saveNotificationPreferences({ push_enabled: true });
    res.accountSaved = !!saved?.ok && !saved?.error;
  }
  emit();
  return res;
}

/** Désactive sur CET appareil uniquement : le compte et les autres appareils ne changent pas. */
export async function disablePushOnDevice() {
  const res = await disablePushNotifications();
  emit();
  return res;
}

/** Interrupteur général du compte (tous les appareils). */
export async function setAccountPush(value) {
  const res = await saveNotificationPreferences({ push_enabled: !!value });
  emit();
  return res;
}

/** Réinitialisation : retire la désactivation volontaire, sans jamais redemander la permission. */
export async function resetPushDeviceState() {
  try {
    localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignore */
  }
  try {
    await syncPushForCurrentUser();
  } catch {
    /* ignore */
  }
  try {
    await getPushState(); // recalcule notif_push même si aucun panneau n'est monté
  } catch {
    /* ignore */
  }
  emit();
}

/** Hook : état réel, rafraîchi après chaque action et au retour dans l'app. */
export function usePushState() {
  const [state, setState] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setState(await getPushState());
    } catch (e) {
      console.warn("[pushState]", e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(PUSH_STATE_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(PUSH_STATE_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { state, refresh };
}
