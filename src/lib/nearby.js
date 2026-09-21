import { Capacitor } from "@capacitor/core";

const PLUGIN_NAME = "NearbyConnections";
const SERVICE_NAME = "com.baaro.app.p2p";

// On récupère le plugin via Capacitor.Plugins - pas besoin de npm import statique
const getPlugin = () => {
  try {
    // @ts-ignore
    return Capacitor.Plugins?.NearbyConnections || null;
  } catch {
    return null;
  }
};

let isInitialized = false;
let connectedEndpoints = new Set();

export function isNearbyAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.isPluginAvailable(PLUGIN_NAME) && !!getPlugin();
}

export function getNearbyDebug() {
  return {
    isNative: Capacitor.isNativePlatform(),
    isPluginAvailable: Capacitor.isPluginAvailable(PLUGIN_NAME),
    platform: Capacitor.getPlatform(),
    hasPlugin: !!getPlugin(),
    isInitialized,
    connectedCount: connectedEndpoints.size,
  };
}

export async function checkNearbyPermissions() {
  const plugin = getPlugin();
  if (!plugin?.checkPermissions) return { nearby: "granted", location: "granted" };
  try {
    const status = await plugin.checkPermissions();
    return { nearby: status.nearby || "granted", location: status.location || "granted", raw: status };
  } catch {
    return { nearby: "granted", location: "granted" };
  }
}

export async function requestNearbyPermissions() {
  const plugin = getPlugin();
  if (!plugin?.requestPermissions) return { nearby: "granted", location: "granted" };
  await plugin.requestPermissions({ permissions: ["nearby", "location"] });
  return await checkNearbyPermissions();
}

async function ensureInitialized() {
  if (isInitialized) return;
  const plugin = getPlugin();
  if (!plugin) throw new Error("Plugin Nearby non installé");
  // Strategy.P2P_CLUSTER = 1 - valeur par défaut si enum non chargé
  await plugin.initialize({
    serviceName: SERVICE_NAME,
    strategy: 1, // P2P_CLUSTER
  });
  isInitialized = true;
}

export async function startNearby(displayName = "BAARO User") {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible - fais npm install capacitor-nearby-plugin");
  await ensureInitialized();
  const plugin = getPlugin();
  await plugin.startAdvertising({ name: displayName });
  await plugin.startDiscovery();
}

export async function stopNearby() {
  const plugin = getPlugin();
  if (!plugin) return;
  try { await plugin.stopAdvertising(); } catch {}
  try { await plugin.stopDiscovery(); } catch {}
  connectedEndpoints.clear();
}

export async function sendNearbyMessage(text, endpointId = null) {
  const plugin = getPlugin();
  if (!plugin) throw new Error("Plugin non dispo");
  if (connectedEndpoints.size === 0 && !endpointId) throw new Error("Aucun appareil connecté");
  const payload = typeof text === "string" ? text : JSON.stringify(text);
  if (endpointId) {
    await plugin.sendMessage({ endpointId, data: payload });
  } else {
    for (const id of connectedEndpoints) {
      await plugin.sendMessage({ endpointId: id, data: payload });
    }
  }
}

export const acceptNearbyConnection = async (endpointId) => {
  const plugin = getPlugin();
  await plugin?.acceptConnection({ endpointId });
  connectedEndpoints.add(endpointId);
};

export const rejectNearbyConnection = async (endpointId) => {
  await getPlugin()?.rejectConnection({ endpointId });
};

export function onNearbyEvent(_eventName, callback) {
  const plugin = getPlugin();
  if (!plugin) return { remove: () => {} };

  const listeners = [];
  listeners.push(plugin.addListener("onEndpointFound", (data) => {
    callback({ type: "DEVICE_FOUND", endpointId: data.endpointId, deviceName: data.endpointName || data.name });
  }));
  listeners.push(plugin.addListener("onEndpointLost", (data) => {
    callback({ type: "DEVICE_LOST", endpointId: data.endpointId });
  }));
  listeners.push(plugin.addListener("onConnectionInitiated", (data) => {
    plugin.acceptConnection({ endpointId: data.endpointId });
  }));
  listeners.push(plugin.addListener("onConnectionResult", (data) => {
    if (data.result === "SUCCESS" || data.status === "SUCCESS") {
      connectedEndpoints.add(data.endpointId);
      callback({ type: "DEVICE_CONNECTED", endpointId: data.endpointId });
    }
  }));
  listeners.push(plugin.addListener("onDisconnected", (data) => {
    connectedEndpoints.delete(data.endpointId);
    callback({ type: "DEVICE_DISCONNECTED", endpointId: data.endpointId });
  }));
  listeners.push(plugin.addListener("onMessageReceived", (data) => {
    callback({ type: "MESSAGE_RECEIVED", endpointId: data.endpointId, text: data.data, senderName: data.endpointName || "Proche" });
  }));

  return { remove: () => listeners.forEach(l => l.remove()) };
}
