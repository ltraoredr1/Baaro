import "../i18n.js";
import React from "react";
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

// Ne bloque JAMAIS le render
try { captureRefFromUrl(); } catch {}
try { initPerf(); } catch {}

// FIX NATIF : Config StatusBar en safe
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
bootstrapNative().catch((e) => console.log("bootstrapNative error (non bloquant)", e));

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

// Service Worker uniquement sur web
if ("serviceWorker" in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener("load", () => {
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  });
} else if (Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
