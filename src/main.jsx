import "../i18n.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import App from "./app/App.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { captureRefFromUrl } from "./lib/referralApi.js";
import { initPerf } from "./lib/initPerf.js";
import { bootstrapNative } from "./lib/nativeBootstrap.js";
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

// ===================================================================
// FIX NATIF 2 : StatusBar + Capgo Updater
// ===================================================================
const setupNative = async () => {
  if (!Capacitor.isNativePlatform()) return;

  // StatusBar
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b1220" });
  } catch (e) {
    console.log("StatusBar not available", e);
  }

  // Capgo - Notifier que l'app est prête (évite le rollback)
  try {
    await CapacitorUpdater.notifyAppReady();
    console.log("[Capgo] App ready notified");
    
    // Optionnel: écouter les updates
    CapacitorUpdater.addListener("updateAvailable", (res) => {
      console.log("[Capgo] Update available", res);
    });
  } catch (e) {
    console.log("[Capgo] Updater not ready", e);
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
// ===================================================================
if ("serviceWorker" in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  } else {
    window.addEventListener("load", () => {
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    });
  }
}
