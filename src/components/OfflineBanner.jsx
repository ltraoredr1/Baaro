/**
 * Bandeau hors-ligne + reconnexion.
 *
 * - Utilisateurs : message clair, conseils qui défilent, puis « Connexion rétablie ».
 * - Développement : ligne de diagnostic (état réseau, débit, durée hors ligne),
 *   visible en mode dev, ou sur téléphone en ouvrant l'app avec ?debug=1
 *   (mémorisé ; pour le retirer : ?debug=0).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { WifiOff, Wifi } from "lucide-react";
import { flushOfflineEvents } from "../lib/feedEvents.js";
import { flushOfflineActions } from "../lib/offlineActions.js";

const DEBUG_KEY = "baaro_debug";

function isDebug() {
  try {
    return Boolean(import.meta.env.DEV) || localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return Boolean(import.meta.env.DEV);
  }
}

// Un échec de synchronisation ne doit jamais casser l'app.
function safeFlush(fn, label) {
  try {
    Promise.resolve(fn()).catch((e) => {
      if (isDebug()) console.warn(`[BAARO] sync ${label} échouée`, e);
    });
  } catch (e) {
    if (isDebug()) console.warn(`[BAARO] sync ${label} échouée`, e);
  }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => {
      setOnline(true);
      safeFlush(flushOfflineEvents, "events");
      safeFlush(flushOfflineActions, "actions");
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  const [tipIndex, setTipIndex] = useState(0);
  const [justBack, setJustBack] = useState(false);
  const [debugLine, setDebugLine] = useState("");

  const wasOffline = useRef(false);
  const offlineSince = useRef(null);

  // ?debug=1 / ?debug=0 : active ou retire le diagnostic développeur.
  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get("debug");
      if (flag === "1") localStorage.setItem(DEBUG_KEY, "1");
      if (flag === "0") localStorage.removeItem(DEBUG_KEY);
    } catch {}
  }, []);

  // Passage hors ligne / retour du réseau.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      offlineSince.current = Date.now();
      setJustBack(false);
      return undefined;
    }
    if (!wasOffline.current) return undefined;
    wasOffline.current = false;
    setJustBack(true);
    const timer = setTimeout(() => setJustBack(false), 3500);
    return () => clearTimeout(timer);
  }, [online]);

  // Conseils qui défilent pendant la coupure.
  useEffect(() => {
    if (online) return undefined;
    setTipIndex(0);
    const timer = setInterval(() => setTipIndex((i) => i + 1), 5000);
    return () => clearInterval(timer);
  }, [online]);

  // Diagnostic développeur (mis à jour chaque seconde, seulement hors ligne).
  useEffect(() => {
    if (online || !isDebug()) {
      setDebugLine("");
      return undefined;
    }
    const update = () => {
      const c = navigator.connection;
      const secs = offlineSince.current
        ? Math.round((Date.now() - offlineSince.current) / 1000)
        : 0;
      setDebugLine(
        `[debug] onLine=${navigator.onLine} · réseau=${c?.effectiveType ?? "?"} · ` +
          `${c?.downlink ?? "?"} Mb/s · rtt=${c?.rtt ?? "?"} ms · hors ligne depuis ${secs}s`
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [online]);

  if (online && !justBack) return null;

  const topPadding = { paddingTop: "max(0.5rem, env(safe-area-inset-top))" };

  // Réseau revenu : message court, la synchronisation part toute seule.
  if (online) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold"
        style={{ background: "#14532d", color: "#bbf7d0", ...topPadding }}
        role="status"
        aria-live="polite"
      >
        <Wifi size={14} aria-hidden />
        {t("offline.back", "Connexion rétablie — synchronisation en cours…")}
      </div>
    );
  }

  const tips = [
    t("offline.tip_queue", "Tes actions sont mises en file et partiront au retour du réseau"),
    t("offline.tip_check", "Vérifie le Wi‑Fi ou les données mobiles de ton téléphone"),
    t("offline.tip_open", "Les écrans déjà ouverts restent consultables"),
  ];

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-xs"
      style={{ background: "#7f1d1d", color: "#fecaca", ...topPadding }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-semibold">
        <WifiOff size={14} aria-hidden />
        {t("offline.title", "Hors ligne")}
      </div>
      <div className="text-[11px] opacity-90 text-center">
        {tips[tipIndex % tips.length]}
      </div>
      {debugLine && (
        <div className="text-[10px] font-mono opacity-70 text-center break-all">
          {debugLine}
        </div>
      )}
    </div>
  );
}

export default OfflineBanner;
