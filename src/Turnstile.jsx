import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let scriptPromise = null;
function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
      // FIX NATIF : timeout 4s max, sinon on bypass
      setTimeout(() => reject(new Error("Turnstile timeout")), 4000);
    });
  }
  return scriptPromise;
}

export function TurnstileWidget({ onVerify }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) {
      onVerify("dev-bypass");
      return;
    }
    let cancelled = false;
    loadTurnstileScript()
     .then(() => {
        if (cancelled ||!containerRef.current ||!window.turnstile) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token) => onVerify(token),
          "error-callback": () => onVerify(null),
          "expired-callback": () => onVerify(null),
        });
      })
     .catch(() => {
        // FIX : si offline ou timeout, on laisse passer en natif
        // Ton backend Supabase vérifiera quand même, mais l'user n'est pas bloqué
        console.warn("[BAARO] Turnstile indisponible, bypass natif");
        onVerify(null);
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch (e) {}
      }
    };
  }, [onVerify]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} />;
}
