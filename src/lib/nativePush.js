import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export async function registerNativePush() {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "web" };
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    return { ok: false, reason: "permission-denied" };
  }

  await PushNotifications.register();
  return { ok: true };
}

export function onNativePushToken(callback) {
  return PushNotifications.addListener("registration", callback);
}

export function onNativePushNotification(callback) {
  return PushNotifications.addListener("pushNotificationReceived", callback);
}

export function onNativePushAction(callback) {
  return PushNotifications.addListener("pushNotificationActionPerformed", callback);
}
