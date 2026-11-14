import "../i18n.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { Capacitor } from "@capacitor/core";
import App from "./app/App.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { captureRefFromUrl } from "./lib/referralApi.js";
import { initPerf } from "./lib/initPerf.js";
import { bootstrapNative } from "./lib/nativeBootstrap.js";
import { checkUpdateNative } from "./lib/nativeUpdater.js";
import { store } from "./store/index.js";
import "./index.css";

// ===================================================================
// FIX NATIF 1 : API - Le plus important
// En APK, on est sur https://localhost -> /api/... renvoie index.html
// On redirige tout vers Vercel. Sur le web, rien ne change.
// ===================================================================
if (Capacitor.isNativePlatform() && !window.__baaroFetchPatched) {
  window.__baaroFetchPatched = true;
  const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "https://baaro-xi.vercel.app").replace(/\/$/, "");
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    try {
      // cas 1: fetch("/api/...")
      if (typeof input === "string" && input.startsWith("/api/")) {
        return originalFetch(`${API_ORIGIN}${input}`, init);
      }
      // cas 2: fetch(new Request("/api/..."))
      if (input instanceof Request) {
        const url = new URL(input.url, window.location.origin);
        if (url.pathname.startsWith("/api/")) {
          const target = `${API_ORIGIN}${url.pathname}${url.search}`;
          return originalFetch(new Request(target, input), init);
        }
      }
    } catch (e) {
      console.warn("[BAARO] fetch patch error", e);
    }
    return originalFetch(input, init);
  };
}

captureRefFromUrl();
initPerf();

// Mises à jour natives : exclusivement par BAARO Updater Maison.
const setupNative = async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const result = await checkUpdateNative();

    if (result?.installerLaunched) {
      console.info("[BAARO] Installateur Android lancé :", result.version);
    } else if (result?.permissionRequired) {
      console.info("[BAARO] Autorisation Android d'installation requise.");
    } else if (result?.available) {
      console.info("[BAARO] Mise à jour disponible :", result.version);
    } else if (result?.error) {
      console.warn("[BAARO] Updater Maison :", result.error);
    }
  } catch (error) {
    console.warn("[BAARO] Updater Maison indisponible :", error);
  }

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b1220" });
  } catch (error) {
    console.log("StatusBar not available", error);
  }
};

setupNative();
bootstrapNative().catch((e) => console.log("bootstrapNative error", e));

/**
 * Ordre des providers :
 * 1. Redux -> UI
 * 2. AppContext -> auth / session
 * 3. ToastProvider -> notifications
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <AppProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AppProvider>
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);

// ===================================================================
// FIX NATIF 3 : Service Worker - Jamais en APK
// - Sur le Web : on utilise VitePWA autoUpdate (dans vite.config.js)
// - En APK : les mises à jour passent exclusivement par un APK signé BAARO.
// ===================================================================
if ("serviceWorker" in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  } else if (!import.meta.env.DEV) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.warn("[BAARO] Service worker indisponible :", error));
    });
  }
}
