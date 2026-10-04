import { isNativeApp, getNativePlatform } from "./nativeCapabilities.js";
import { enableSecureScreen } from "./secureScreen.js";
import { registerNativePush } from "./nativePush.js";

export async function bootstrapNative() {
  if (!isNativeApp()) return { ok: true, platform: "web" };
  const platform = getNativePlatform();
  try { await enableSecureScreen(); } catch (e) { console.warn("[BAARO] secureScreen:", e?.message || e); }
  try { await registerNativePush(); } catch (e) { console.warn("[BAARO] nativePush:", e?.message || e); }
  return { ok: true, platform };
}

export { isNativeApp, getNativePlatform, isAndroid, isIOS, isWeb } from "./nativeCapabilities.js";
export { enableSecureScreen, disableSecureScreen } from "./secureScreen.js";
export { registerNativePush, onNativePushToken, onNativePushNotification } from "./nativePush.js";
