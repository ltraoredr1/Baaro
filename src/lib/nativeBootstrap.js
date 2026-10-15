import {
  isNativeApp,
  getNativePlatform,
} from "./nativeCapabilities.js";

import { enableSecureScreen } from "./secureScreen.js";
import { enablePushNotifications } from "./pushNotifications.js";

export async function registerNativePush() {
  return enablePushNotifications();
}

export async function bootstrapNative() {
  if (!isNativeApp()) {
    return {
      ok: true,
      platform: "web",
    };
  }

  const platform = getNativePlatform();

  try {
    await enableSecureScreen();
  } catch (error) {
    console.warn(
      "[BAARO] secureScreen:",
      error?.message || error
    );
  }

  try {
    const result = await registerNativePush();

    if (!result?.ok) {
      console.warn(
        "[BAARO] nativePush:",
        result?.error || "Activation impossible"
      );
    }
  } catch (error) {
    console.warn(
      "[BAARO] nativePush:",
      error?.message || error
    );
  }

  return {
    ok: true,
    platform,
  };
}

export {
  isNativeApp,
  getNativePlatform,
  isAndroid,
  isIOS,
  isWeb,
} from "./nativeCapabilities.js";

export {
  enableSecureScreen,
  disableSecureScreen,
} from "./secureScreen.js";
