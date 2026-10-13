import "../i18n.js";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter as BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import App from "./app/App.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { captureRefFromUrl } from "./lib/referralApi.js";
import { initPerf } from "./lib/initPerf.js";
import { bootstrapNative } from "./lib/nativeBootstrap.js";
import { store } from "./store/index.js";
import "./index.css";

// --- 1. SENTRY (optionnel, mets ton DSN) ---
// import * as Sentry from "@sentry/react";
// if (import.meta.env.VITE_SENTRY_DSN) {
//   Sentry.init({
//     dsn: import.meta.env.VITE_SENTRY_DSN,
//     tracesSampleRate: 0.1,
//     environment: import.meta.env.MODE,
//   });
// }

// --- 2. Perf & Referral non-bloquants ---
try { captureRefFromUrl(); } catch {}
try { initPerf(); } catch {}

// --- 3. FIX NATIF : StatusBar + NavigationBar ---
const setupNative = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b1220" });
    // Optionnel: évite le flash blanc
    document.documentElement.style.backgroundColor = "#0b1220";
  } catch (e) {
    console.log("[BAARO] StatusBar not available", e);
  }
};

setupNative();
bootstrapNative().catch((e) => console.log("[BAARO] bootstrapNative error (non bloquant)", e));

// --- 4. Preload critiques après idle ---
if (typeof window !== "undefined") {
  const preload = () => {
    import("./features/feed/index.js").catch(() => {});
    import("./features/messaging/index.js").catch(() => {});
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preload, { timeout: 4000 });
  } else {
    setTimeout(preload, 3000);
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <AppProvider>
            <ToastProvider>
              <Suspense fallback={
                <div style={{
                  display: 'flex', height: '100vh', alignItems: 'center',
                  justifyContent: 'center', background: '#0b1220', color: '#D9AE52'
                }}>
                  <div>Chargement BAARO...</div>
                </div>
              }>
                <App />
              </Suspense>
            </ToastProvider>
          </AppProvider>
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);

// --- 5. Service Worker ---
if ("serviceWorker" in navigator) {
  if (!Capacitor.isNativePlatform()) {
    window.addEventListener("load", () => {
      // VitePWA gère déjà sw.js, on n'enregistre que si pas déjà contrôlé
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      }
    });
  } else {
    // Natif: désactive tout SW pour éviter conflits avec Capacitor HTTP
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  }
}

// --- 6. Global error hook pour debug ---
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason?.message || e.reason || "");
  if (msg.includes("Failed to fetch") || msg.includes("dynamically imported")) {
    console.warn("[BAARO] Chunk error global, reload soft...");
    const key = "baaro_global_chunk_reload";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 20000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }
});
