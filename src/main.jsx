import "../i18n.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
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

captureRefFromUrl();
initPerf();

// FIX NATIF : Config StatusBar pour APK
const setupNative = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#0b1220" });
    } catch (e) {
      console.log("StatusBar not available", e);
    }
  }
};

setupNative();
bootstrapNative().catch(() => {});

/**
 * Ordre des providers (du plus externe au plus interne) :
 * 1. Redux          → UI + wallet
 * 2. AppContext     → auth / session / profil
 * 3. ToastProvider  → notifications toast
 *
 * React Query (si utilisé) se place entre Redux et AppContext
 * ou dans App.jsx selon ton setup actuel.
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

// FIX NATIF : Pas de Service Worker sur l'APK
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  });
} else if (Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
