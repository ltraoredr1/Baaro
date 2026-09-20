import { registerPlugin } from "@capacitor/core";

/**
 * Pont vers le plugin natif Android "NearbyChat", basé sur l'API Google
 * Nearby Connections. Permet d'échanger des messages avec des téléphones
 * proches via Bluetooth / Wi-Fi, sans connexion Internet ni forfait data.
 *
 * N'est fonctionnel que dans la version native (Android), jamais sur le web
 * — voir isNearbyAvailable() avant tout appel.
 */
const NearbyChat = registerPlugin("NearbyChat");

/** true uniquement dans l'app Android compilée avec le plugin natif installé. */
export function isNearbyAvailable() {
  return (
    typeof window !== "undefined" &&
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform() &&
    window.Capacitor.isPluginAvailable("NearbyChat")
  );
}

/** Démarre la recherche + la diffusion de présence auprès des appareils proches. */
export async function startNearby(displayName) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible sur cette plateforme");
  try {
    return await NearbyChat.start({ displayName });
  } catch (error) {
    console.error("Erreur startNearby:", error);
    throw error;
  }
}

/** Arrête toute activité Bluetooth/Wi-Fi de proximité liée à BAARO. */
export async function stopNearby() {
  if (!isNearbyAvailable()) return;
  try {
    return await NearbyChat.stop();
  } catch (error) {
    console.error("Erreur stopNearby:", error);
  }
}

/**
 * Envoie un message texte.
 * - Si endpointId est fourni : envoi à cet appareil uniquement
 * - Sinon : broadcast à tous les appareils BAARO connectés à proximité
 */
export async function sendNearbyMessage(text, endpointId = null) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  try {
    return await NearbyChat.send({ text, endpointId });
  } catch (error) {
    console.error("Erreur sendNearbyMessage:", error);
    throw error;
  }
}

/** S'abonne aux événements : appareil trouvé, message reçu, déconnexion. */
export function onNearbyEvent(eventName, callback) {
  return NearbyChat.addListener(eventName, callback);
}

/** Accepte une connexion Nearby en attente après vérification utilisateur/app. */
export async function acceptNearbyConnection(endpointId) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  try {
    return await NearbyChat.accept({ endpointId });
  } catch (error) {
    console.error("Erreur acceptNearbyConnection:", error);
    throw error;
  }
}

/** Refuse une connexion Nearby en attente. */
export async function rejectNearbyConnection(endpointId) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  try {
    return await NearbyChat.reject({ endpointId });
  } catch (error) {
    console.error("Erreur rejectNearbyConnection:", error);
    throw error;
  }
}

/**
 * Vérifie l'état actuel des permissions Bluetooth et Localisation.
 * Retourne un objet { nearby: 'granted'|'denied'|'unavailable', location: '...' }
 */
export async function checkNearbyPermissions() {
  if (!isNearbyAvailable()) return { nearby: "unavailable", location: "unavailable" };
  try {
    return await NearbyChat.checkPermissions();
  } catch (error) {
    console.error("Erreur checkNearbyPermissions:", error);
    return { nearby: "unavailable", location: "unavailable" };
  }
}

/**
 * Demande les permissions à l'utilisateur (affiche la popup Android).
 * Les alias "nearby" et "location" sont définis dans le plugin Kotlin.
 */
export async function requestNearbyPermissions() {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  try {
    return await NearbyChat.requestPermissions();
  } catch (error) {
    console.error("Erreur requestNearbyPermissions:", error);
    throw error;
  }
}
