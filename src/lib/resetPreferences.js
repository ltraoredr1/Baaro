import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  saveNotificationPreferences,
  saveSoundPreferences,
} from "./notificationPreferences.js";
import { replaceSoundPrefs } from "./notificationSoundStore.js";
import { DEFAULT_SOUND_PREFS, toServerSoundPrefs } from "./notificationSounds.js";
import { markBiometricDevice } from "./nativeSettings.js";
import { resetPushDeviceState } from "./pushState.js";

/**
 * Réinitialisation complète des préférences, SANS toucher à la session (sb-*).
 * Renvoie toujours { ok, localOnly?, error?, partial } ;
 * partial = le serveur n'a pas confirmé une étape annexe (le local est réinitialisé).
 */
export async function resetAllPreferences(resetSettings) {
  const [main, notif, sound] = await Promise.allSettled([
    // 1. Réglages principaux : local + DOM + cloud (langue conservée)
    resetSettings(),
    // 2. Préférences de notification : défauts en local ET serveur
    saveNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES }),
    // 3. Son : mémoire + localStorage + abonnés, puis serveur
    (async () => {
      replaceSoundPrefs(DEFAULT_SOUND_PREFS);
      return saveSoundPreferences(toServerSoundPrefs(DEFAULT_SOUND_PREFS));
    })(),
  ]);

  // 4. Biométrie : propre à l'appareil, on retire la vérification locale
  try {
    markBiometricDevice(false);
  } catch {
    /* ignore */
  }

  const res =
    main.status === "fulfilled" && main.value
      ? main.value
      : { ok: false, error: "reset" };
  if (!res.ok && !res.localOnly) return { ...res, partial: false };

  let partial =
    notif.status === "rejected" ||
    !notif.value?.ok ||
    !!notif.value?.error ||
    sound.status === "rejected" ||
    (!!sound.value && !sound.value.ok);

  // 5. Push de cet appareil : retire la désactivation volontaire, sans redemander la permission
  try {
    await resetPushDeviceState();
  } catch {
    partial = true;
  }

  return { ...res, partial };
}
