import { useEffect, useRef } from "react";

// Clé publique Turnstile (Cloudflare) — voir README pour la configuration.
// Contrairement à la clé API Anthropic, cette clé est PUBLIQUE par design :
// elle identifie le site, pas un secret. Le secret Turnstile associé reste
// côté serveur, dans les réglages CAPTCHA de Supabase Auth.
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
    });
  }
  return scriptPromise;
}

/**
 * Petit widget de vérification humaine affiché une fois, avant la création
 * du compte anonyme. `onVerify(token)` reçoit le jeton à transmettre à
 * `supabase.auth.signInAnonymously({ options: { captchaToken } })`.
 *
 * Si aucune clé n'est configurée (développement local), on ne bloque pas :
 * on transmet directement un jeton factice et l'app continue normalement.
 */
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
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (token) => onVerify(token),
          "error-callback": () => onVerify(null),
          "expired-callback": () => onVerify(null),
        });
      })
      .catch(() => onVerify(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch (e) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} />;
}
