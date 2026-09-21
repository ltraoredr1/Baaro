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

export function TurnstileWidget({ onVerify }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    // 1. APK = bypass direct, pas de widget
    if (Capacitor.isNativePlatform()) {
      console.log("[BAARO] Native -> Turnstile bypass");
      onVerify("native-bypass");
      setStatus("bypass");
      return;
    }

    // 2. Pas de clé = ERREUR VISIBLE, pas bypass silencieux
    if (!SITE_KEY) {
      console.error("[BAARO] VITE_TURNSTILE_SITE_KEY manquant! Check Vercel Env Vars");
      setStatus("no-key");
      onVerify(null);
      return;
    }

    let cancelled = false;
    loadTurnstileScript().then((loaded) => {
      if (cancelled) return;
      if (!loaded ||!window.turnstile ||!containerRef.current) {
        console.warn("[BAARO] Turnstile script bloqué (AdBlock/CSP)");
        setStatus("blocked");
        onVerify(null); // Laisse passer mais log
        return;
      }
      try {
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token) => {
            setStatus("verified");
            onVerify(token);
          },
          "error-callback": () => {
            setStatus("error");
            onVerify(null);
          },
          "expired-callback": () => {
            setStatus("expired");
            onVerify(null);
          },
        });
        setStatus("ready");
      } catch (e) {
        console.error(e);
        setStatus("error");
        onVerify(null);
      }
    });

    return () => {
      cancelled = true;
      if (widgetId.current!== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
      }
    };
  }, [onVerify]);

  if (Capacitor.isNativePlatform()) return null;

  if (!SITE_KEY) {
    return <div style={{color:'#ff6b6b', fontSize:12}}>ERREUR: VITE_TURNSTILE_SITE_KEY manquant sur Vercel</div>;
  }

  return (
    <div>
      <div ref={containerRef} />
      {status === "loading" && <p style={{fontSize:12, opacity:0.6}}>Chargement vérification...</p>}
      {status === "blocked" && <p style={{fontSize:12, opacity:0.6}}>Vérification bloquée par AdBlock - continuons</p>}
    </div>
  );
}
