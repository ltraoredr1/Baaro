import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let scriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function TurnstileWidget({ onVerify, isGuest = false }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);
  const [status, setStatus] = useState("loading");
  const onVerifyRef = useRef(onVerify);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    // BYPASS INVITE + APK NATIF = pas de widget, pas de boucle
    if (isGuest) {
      onVerifyRef.current("guest-bypass-token");
      setStatus("bypass");
      return;
    }
    if (Capacitor.isNativePlatform()) {
      onVerifyRef.current("native-bypass");
      setStatus("bypass");
      return;
    }
    if (!SITE_KEY) {
      setStatus("no-key");
      onVerifyRef.current(null);
      return;
    }

    let cancelled = false;
    loadTurnstileScript().then((loaded) => {
      if (cancelled ||!containerRef.current) return;
      if (!loaded ||!window.turnstile) {
        setStatus("blocked");
        onVerifyRef.current(null);
        return;
      }
      try {
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token) => {
            setStatus("verified");
            onVerifyRef.current(token);
          },
          "error-callback": () => {
            setStatus("error");
            onVerifyRef.current(null);
          },
          "expired-callback": () => {
            setStatus("expired");
            onVerifyRef.current(null);
          },
        });
        setStatus("ready");
      } catch {
        setStatus("error");
        onVerifyRef.current(null);
      }
    });

    return () => {
      cancelled = true;
      if (widgetId.current!== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
      }
    };
  }, [isGuest]); // FIX BOUCLE: onVerify retiré des dépendances

  if (isGuest || Capacitor.isNativePlatform()) return null;

  return (
    <div>
      <div ref={containerRef} />
      {status === "loading" && <p style={{fontSize:12, opacity:0.6}}>Chargement vérification...</p>}
    </div>
  );
}
