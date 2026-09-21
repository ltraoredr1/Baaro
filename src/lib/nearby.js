import { Capacitor } from "@capacitor/core";

const PLUGIN_NAME = "NearbyConnections";
let NearbyPlugin = null;

try {
  // @ts-ignore
  const { NearbyConnections } = Capacitor.Plugins;
  NearbyPlugin = Capacitor.isPluginAvailable(PLUGIN_NAME)? NearbyConnections : null;
} catch {
  NearbyPlugin = null;
}

export function isNearbyAvailable() {
  // Sur web = toujours false, c'est normal
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.isPluginAvailable(PLUGIN_NAME) &&!!NearbyPlugin;
}

export function getNearbyDebug() {
  return {
    isNative: Capacitor.isNativePlatform(),
    isPluginAvailable: Capacitor.isPluginAvailable(PLUGIN_NAME),
    platform: Capacitor.getPlatform(),
    hasPlugin:!!NearbyPlugin,
  };
}

export async function checkNearbyPermissions() {
  if (!isNearbyAvailable()) return { nearby: "denied", location: "denied" };
  try {
    if (NearbyPlugin.checkPermissions) {
      return await NearbyPlugin.checkPermissions();
    }
    return { nearby: "granted", location: "granted" };
  } catch {
    return { nearby: "granted", location: "granted" };
  }
}

export async function requestNearbyPermissions() {
  if (!isNearbyAvailable()) throw new Error("Plugin Nearby non installé");
  return await NearbyPlugin.requestPermissions();
}

export async function startNearby(displayName) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible sur web - build l'APK");
  return await NearbyPlugin.start({ displayName });
}

export async function stopNearby() {
  if (!NearbyPlugin) return;
  return await NearbyPlugin.stop();
}

export async function sendNearbyMessage(text, endpointId = null) {
  if (!isNearbyAvailable()) throw new Error("Nearby indisponible");
  return await NearbyPlugin.sendMessage({ text, endpointId });
}

export function onNearbyEvent(eventName, callback) {
  if (!NearbyPlugin) return { remove: () => {} };
  return NearbyPlugin.addListener(eventName, callback);
}

export const acceptNearbyConnection = (endpointId) => NearbyPlugin?.acceptConnection({ endpointId });
export const rejectNearbyConnection = (endpointId) => NearbyPlugin?.rejectConnection({ endpointId });
