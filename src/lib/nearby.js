import { Capacitor } from "@capacitor/core";
import { NearbyConnections, Strategy } from "capacitor-nearby-plugin";

const SERVICE_NAME = "com.baaro.app.p2p";
const PLUGIN_NAME = "NearbyConnections";

let isInitialized = false;
let connectedEndpoints = new Set();

// ---------- DEBUG ----------
export function isNearbyAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.isPluginAvailable(PLUGIN_NAME);
}

export function getNearbyDebug() {
  return {
    isNative: Capacitor.isNativePlatform(),
    isPluginAvailable: Capacitor.isPluginAvailable(PLUGIN_NAME),
    platform: Capacitor.getPlatform(),
    hasPlugin: isNearbyAvailable(),
    isInitialized,
    connectedCount: connectedEndpoints.size,
  };
}

// ---------- PERMISSIONS ----------
export async function checkNearbyPermissions() {
  try {
    const status = await NearbyConnections.checkPermissions();
    // status = { location: 'granted', nearby: 'granted',... }
    const loc = status.location || status.coarseLocation || "granted";
    const near = status.nearby || status.bluetooth || "granted";
    return { nearby: near, location: loc, raw: status };
  } catch {
    return { nearby: "granted", location: "granted" };
  }
}

export async function requestNearbyPermissions() {
  try {
    await NearbyConnections.requestPermissions({ permissions: ["nearby", "location"] });
    return await checkNearbyPermissions();
  } catch (e) {
    throw e;
  }
}

// ---------- CORE ----------
async function ensureInitialized() {
  if (isInitialized) return;
  await NearbyConnections.initialize({
    serviceName: SERVICE_NAME,
    strategy: Strategy.P2P_CLUSTER,
  });
  isInitialized = true;
}

export async function startNearby(displayName = "BAARO User") {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible - plugin manquant");

  await ensureInitialized();

  await NearbyConnections.startAdvertising({ name: displayName });
  await NearbyConnections.startDiscovery();
  console.log("[Nearby] Advertising + Discovery started as", displayName);
}

export async function stopNearby() {
  try {
    await NearbyConnections.stopAdvertising();
  } catch {}
  try {
    await NearbyConnections.stopDiscovery();
  } catch {}
  connectedEndpoints.clear();
}

export async function sendNearbyMessage(text, endpointId = null) {
  if (connectedEndpoints.size === 0) throw new Error("Aucun appareil connecté");

  const payload = typeof text === "string"? text : JSON.stringify(text);

  if (endpointId) {
    await NearbyConnections.sendMessage({ endpointId, data: payload });
  } else {
    // broadcast à tous les connectés
    for (const id of connectedEndpoints) {
      await NearbyConnections.sendMessage({ endpointId: id, data: payload });
    }
  }
}

export const acceptNearbyConnection = async (endpointId) => {
  await NearbyConnections.acceptConnection({ endpointId });
  connectedEndpoints.add(endpointId);
};

export const rejectNearbyConnection = async (endpointId) => {
  await NearbyConnections.rejectConnection({ endpointId });
};

// ---------- EVENT WRAPPER ----------
// Ton hook attend un seul listener "nearbyEvent" avec type DEVICE_FOUND etc.
// On traduit les events natifs du plugin vers ce format.
export function onNearbyEvent(_eventName, callback) {
  const listeners = [];

  listeners.push(
    NearbyConnections.addListener("onEndpointFound", (data) => {
      // data: { endpointId, endpointName }
      callback({
        type: "DEVICE_FOUND",
        endpointId: data.endpointId,
        deviceName: data.endpointName || data.name || "Appareil BAARO",
      });
    })
  );

  listeners.push(
    NearbyConnections.addListener("onEndpointLost", (data) => {
      callback({ type: "DEVICE_LOST", endpointId: data.endpointId });
    })
  );

  listeners.push(
    NearbyConnections.addListener("onConnectionInitiated", (data) => {
      // data: { endpointId, endpointName }
      // Auto-accept pour BAARO
      NearbyConnections.acceptConnection({ endpointId: data.endpointId });
    })
  );

  listeners.push(
    NearbyConnections.addListener("onConnectionResult", (data) => {
      // data: { endpointId, result: 'SUCCESS' }
      if (data.result === "SUCCESS" || data.status === "SUCCESS") {
        connectedEndpoints.add(data.endpointId);
        callback({ type: "DEVICE_CONNECTED", endpointId: data.endpointId });
      }
    })
  );

  listeners.push(
    NearbyConnections.addListener("onDisconnected", (data) => {
      connectedEndpoints.delete(data.endpointId);
      callback({ type: "DEVICE_DISCONNECTED", endpointId: data.endpointId });
    })
  );

  listeners.push(
    NearbyConnections.addListener("onMessageReceived", (data) => {
      // data: { endpointId, data }
      callback({
        type: "MESSAGE_RECEIVED",
        endpointId: data.endpointId,
        text: data.data,
        senderName: data.endpointName || "Proche",
      });
    })
  );

  return {
    remove: () => listeners.forEach((l) => l.remove()),
  };
}
