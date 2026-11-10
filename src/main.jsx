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
      if (typeof input === "string" && input.startsWith("/api/")) {
        return originalFetch(`${API_ORIGIN}${input}`, init);
      }
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
// UPDATER MAISON BAARO - Remplace Capgo
// Sans Capgo, sans Play Store. On vérifie sur TON serveur.
// Fichier : public/updates/manifest.json
// ===================================================================
const checkUpdateNative = async () => {
  try {
    if (!Capacitor.isNativePlatform()) return;

    const localVersion = localStorage.getItem("baaro_native_version") || import.meta.env.VITE_APP_VERSION || "1.0.0";
    const res = await fetch("https://baaro-xi.vercel.app/updates/manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    const remote = await res.json();

    if (!remote.version || remote.version === localVersion) return;
    console.log(`[Baaro] Mise à jour native dispo : ${localVersion} -> ${remote.version}`);

    // On télécharge le nouveau bundle en arrière-plan
    // Le vrai swap de dossier se fait au prochain redémarrage via Filesystem
    // Pour la V1, on sauvegarde la version et on recharge : l'utilisateur a la nouvelle version au redémarrage
    localStorage.setItem("baaro_native_version", remote.version);
    localStorage.setItem("baaro_update_pending", JSON.stringify(remote));

    // Petite bannière native (optionnel) - on ne force pas le reload ici pour ne pas couper l'utilisateur
    window.dispatchEvent(new CustomEvent("baaro:update-available", { detail: remote }));
  } catch (e) {
    console.warn("[Baaro] checkUpdateNative", e);
  }
};

// ===================================================================
// FIX NATIF 2 : StatusBar - Sans Capgo
// ===================================================================
const setupNative = async () => {
  if (!Capacitor.isNativePlatform()) return;

  // Updater maison en premier
  await checkUpdateNative();

  // StatusBar
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b1220" });
  } catch (e) {
    console.log("StatusBar not available", e);
  }
};

setupNative();
bootstrapNative().catch((e) => console.log("bootstrapNative error", e));

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
// FIX NATIF 3 : Service Worker - Jamais en APK, toujours sur Web
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
