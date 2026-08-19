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
  return NearbyChat.start({ displayName });
}

/** Arrête toute activité Bluetooth/Wi-Fi de proximité liée à BAARO. */
export async function stopNearby() {
  return NearbyChat.stop();
}

/** Envoie un message texte à tous les appareils BAARO connectés à proximité. */
export async function sendNearbyMessage(text) {
  return NearbyChat.send({ text });
}

/** S'abonne aux événements : appareil trouvé, message reçu, déconnexion. */
export function onNearbyEvent(eventName, callback) {
  return NearbyChat.addListener(eventName, callback);
}


/** Accept a pending Nearby connection only after user/app-level verification. */
export async function acceptNearbyConnection(endpointId) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  return NearbyChat.accept({ endpointId });
}

/** Reject a pending Nearby connection. */
export async function rejectNearbyConnection(endpointId) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  return NearbyChat.reject({ endpointId });
}
