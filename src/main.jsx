import "../i18n.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import App from "./app/App.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { captureRefFromUrl } from "./lib/referralApi.js";
import { initPerf } from "./lib/initPerf.js";
import "./index.css";

captureRefFromUrl();
initPerf();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// FIX NATIF : Pas de Service Worker sur l'APK
// Sur Android/iOS, le cache du SW bloque les mises à jour
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
  });
}
