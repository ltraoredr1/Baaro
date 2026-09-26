import { Capacitor } from "@capacitor/core";
import { NearbyChat } from "@baaro/nearby-chat";

const SERVICE_NAME = "com.baaro.app.p2p";

let isInitialized = false;
const connectedEndpoints = new Set();

function getPlugin() {
  try {
    // Plugin local enregistré sous le nom NearbyChat
    if (NearbyChat && typeof NearbyChat.start === "function") {
      return NearbyChat;
    }
    // Fallback ancien nom (si un autre plugin est installé)
    // @ts-ignore
    return Capacitor.Plugins?.NearbyConnections || Capacitor.Plugins?.NearbyChat || null;
  } catch {
    return null;
  }
}

export function isNearbyAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== "android") return false;
  return !!getPlugin();
}

export function getNearbyDebug() {
  const plugin = getPlugin();
  return {
    isNative: Capacitor.isNativePlatform(),
    isPluginAvailable: !!plugin,
    platform: Capacitor.getPlatform(),
    hasPlugin: !!plugin,
    isInitialized,
    connectedCount: connectedEndpoints.size,
    pluginName: plugin ? "NearbyChat" : null,
  };
}

export async function checkNearbyPermissions() {
  const plugin = getPlugin();
  if (!plugin?.checkPermissions) {
    return { nearby: "granted", location: "granted" };
  }
  try {
    const status = await plugin.checkPermissions();
    return {
      nearby: status.nearby || "granted",
      location: status.location || "granted",
      raw: status,
    };
  } catch {
    return { nearby: "granted", location: "granted" };
  }
}

export async function requestNearbyPermissions() {
  const plugin = getPlugin();
  if (!plugin?.requestPermissions) {
    return { nearby: "granted", location: "granted" };
  }
  try {
    await plugin.requestPermissions();
  } catch (e) {
    console.warn("requestPermissions Nearby:", e);
  }
  return checkNearbyPermissions();
}

async function ensureInitialized(displayName = "BAARO User") {
  if (isInitialized) return;
  const plugin = getPlugin();
  if (!plugin) {
    throw new Error("Plugin Nearby non installé. Fais : npm install && npx cap sync android");
  }

  // Ton plugin local utilise start({ displayName })
  // On initialise via start si pas de méthode initialize
  if (typeof plugin.initialize === "function") {
    await plugin.initialize({
      serviceName: SERVICE_NAME,
      strategy: 1, // P2P_CLUSTER
    });
  }

  isInitialized = true;
}

export async function startNearby(displayName = "BAARO User") {
  if (!isNearbyAvailable()) {
    throw new Error(
      Capacitor.isNativePlatform()
        ? "Plugin Nearby non disponible. Lance : npm install && npx cap sync android puis rebuild l’APK."
        : "Mode hors-ligne disponible uniquement dans l’application Android native."
    );
  }

  await requestNearbyPermissions();
  await ensureInitialized(displayName);

  const plugin = getPlugin();

  // API de ton plugin local (native-plugins/nearby)
  if (typeof plugin.start === "function") {
    await plugin.start({ displayName });
    return;
  }

  // Fallback API style NearbyConnections (si autre plugin)
  if (typeof plugin.startAdvertising === "function") {
    await plugin.startAdvertising({ name: displayName });
    if (typeof plugin.startDiscovery === "function") {
      await plugin.startDiscovery();
    }
  }
}

export async function stopNearby() {
  const plugin = getPlugin();
  if (!plugin) return;

  try {
    if (typeof plugin.stop === "function") {
      await plugin.stop();
    } else {
      if (typeof plugin.stopAdvertising === "function") await plugin.stopAdvertising();
      if (typeof plugin.stopDiscovery === "function") await plugin.stopDiscovery();
    }
  } catch (_) {}

  connectedEndpoints.clear();
  isInitialized = false;
}

export async function sendNearbyMessage(text, endpointId = null) {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Plugin Nearby non disponible");

  const payload = typeof text === "string" ? text : JSON.stringify(text);

  if (typeof plugin.send === "function") {
    // API plugin local
    await plugin.send({ text: payload, endpointId: endpointId || undefined });
    return;
  }

  if (typeof plugin.sendMessage === "function") {
    if (endpointId) {
      await plugin.sendMessage({ endpointId, data: payload });
    } else {
      for (const id of connectedEndpoints) {
        await plugin.sendMessage({ endpointId: id, data: payload });
      }
    }
    return;
  }

  throw new Error("Méthode d’envoi non disponible sur le plugin");
}

export async function acceptNearbyConnection(endpointId) {
  const plugin = getPlugin();
  if (!plugin) return;

  if (typeof plugin.accept === "function") {
    await plugin.accept({ endpointId });
  } else if (typeof plugin.acceptConnection === "function") {
    await plugin.acceptConnection({ endpointId });
  }
  connectedEndpoints.add(endpointId);
}

export async function rejectNearbyConnection(endpointId) {
  const plugin = getPlugin();
  if (!plugin) return;

  if (typeof plugin.reject === "function") {
    await plugin.reject({ endpointId });
  } else if (typeof plugin.rejectConnection === "function") {
    await plugin.rejectConnection({ endpointId });
  }
}

export function onNearbyEvent(_eventName, callback) {
  const plugin = getPlugin();
  if (!plugin?.addListener) {
    return { remove: () => {} };
  }

  const handles = [];

  // API plugin local (événement unique "nearbyEvent")
  const h1 = plugin.addListener("nearbyEvent", (event) => {
    if (!event) return;

    if (event.type === "DEVICE_FOUND") {
      callback({
        type: "DEVICE_FOUND",
        endpointId: event.endpointId,
        deviceName: event.deviceName || event.endpointName,
      });
    } else if (event.type === "DEVICE_CONNECTED") {
      connectedEndpoints.add(event.endpointId);
      callback({ type: "DEVICE_CONNECTED", endpointId: event.endpointId });
    } else if (event.type === "DEVICE_LOST") {
      connectedEndpoints.delete(event.endpointId);
      callback({ type: "DEVICE_LOST", endpointId: event.endpointId });
    } else if (event.type === "MESSAGE_RECEIVED") {
      callback({
        type: "MESSAGE_RECEIVED",
        endpointId: event.endpointId,
        text: event.text,
        senderName: event.senderName || "Proche",
      });
    } else if (event.type === "CONNECTION_REQUESTED") {
      // Auto-accept (comportement actuel)
      acceptNearbyConnection(event.endpointId);
    } else if (event.type === "ERROR") {
      callback({ type: "ERROR", message: event.message });
    }
  });
  handles.push(h1);

  // Fallback anciens noms d’événements (si autre plugin)
  try {
    handles.push(
      plugin.addListener("onEndpointFound", (data) => {
        callback({
          type: "DEVICE_FOUND",
          endpointId: data.endpointId,
          deviceName: data.endpointName || data.name,
        });
      })
    );
    handles.push(
      plugin.addListener("onConnectionResult", (data) => {
        if (data.result === "SUCCESS" || data.status === "SUCCESS") {
          connectedEndpoints.add(data.endpointId);
          callback({ type: "DEVICE_CONNECTED", endpointId: data.endpointId });
        }
      })
    );
    handles.push(
      plugin.addListener("onMessageReceived", (data) => {
        callback({
          type: "MESSAGE_RECEIVED",
          endpointId: data.endpointId,
          text: data.data || data.text,
          senderName: data.endpointName || "Proche",
        });
      })
    );
  } catch (_) {
    // ignore si les listeners n’existent pas
  }

  return {
    remove: () => {
      handles.forEach((h) => {
        try {
          h?.remove?.();
        } catch (_) {}
      });
    },
  };
}
