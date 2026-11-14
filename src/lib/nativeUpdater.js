/**
 * BAARO Native Updater
 *
 * L'ancien système extrayait automatiquement un ZIP distant dans
 * le stockage de l'application sans signature cryptographique.
 * Cette méthode est désactivée par sécurité.
 *
 * Les mises à jour natives doivent être distribuées sous forme
 * d'APK signé avec la clé officielle BAARO et installées avec
 * confirmation Android. Aucun Play Store ni Capgo.
 */
import { Capacitor } from "@capacitor/core";

export async function checkUpdateNative() {
  if (!Capacitor.isNativePlatform()) {
    return { updated: false, platform: "web" };
  }

  return {
    updated: false,
    disabled: true,
    method: "signed-apk",
    message: "Mise à jour native par APK signé requise."
  };
}
