// Identifiant d'appareil persistant - anti-abus
const KEY = "baaro:device_id";

function generateId() {
  try {
    // 1. Moderne : crypto.randomUUID
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}

  // 2. Fallback vieux téléphones (sans replaceAll)
  try {
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
  } catch {
    return `dev-${Date.now()}-${Math.floor(Math.random() * 1e12)}`;
  }
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = generateId();
      try {
        localStorage.setItem(KEY, id);
      } catch {}
    }
    return id;
  } catch (e) {
    // Stockage indisponible (mode privé) : ID volatile
    return `volatile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Version future pour APK ultra-stable (optionnel)
// Si tu veux que l'ID survive même après vidage cache, 
// remplace localStorage par @capacitor/preferences :
// import { Preferences } from '@capacitor/preferences';
// await Preferences.set({ key: KEY, value: id })
