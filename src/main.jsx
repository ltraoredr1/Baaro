import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AppProvider } from "./contexts/AppContext.jsx";
import { ToastProvider } from "./components/ToastContext.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Service Worker PWA (optionnel — ne bloque pas si absent)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // L'installation reste possible sans le mode hors-ligne si ça échoue.
    });
  });
}
