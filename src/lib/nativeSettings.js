import { Capacitor } from "@capacitor/core";

let bioReady = false;
const readLocal = () => {
  try { return JSON.parse(localStorage.getItem("baaro_settings_v23") || "{}"); } catch (_) { return {}; }
};

export async function applyNativeSettings(s) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PrivacyScreen } = await import("@capacitor-community/privacy-screen");
    if (s.block_screenshots) await PrivacyScreen.enable();
    else await PrivacyScreen.disable();
  } catch (e) { console.warn("[native] privacy-screen", e); }

  if (bioReady) return;
  bioReady = true;
  try {
    const { App } = await import("@capacitor/app");
    const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
    App.addListener("appStateChange", async ({ isActive }) => {
      if (!isActive || !readLocal().biometric) return;
      try {
        const info = await BiometricAuth.checkBiometry();
        if (!info.isAvailable) return;
        await BiometricAuth.authenticate({ reason: "Déverrouiller BAARO" });
      } catch (_) { App.exitApp(); }
    });
  } catch (e) { console.warn("[native] biometric", e); }
}
