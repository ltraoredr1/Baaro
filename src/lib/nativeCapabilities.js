import { Capacitor } from "@capacitor/core";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform() {
  return Capacitor.getPlatform();
}

export function isAndroid() {
  return getNativePlatform() === "android";
}

export function isIOS() {
  return getNativePlatform() === "ios";
}

export function isWeb() {
  return getNativePlatform() === "web";
}
