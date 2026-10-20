import { useState, useEffect } from "react";
import {
  WifiOff,
  Radio,
  Smartphone,
  Send,
  ShieldCheck,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { useNearbyChat } from "../../hooks/useNearbyChat.js";
import { getCachedUsers } from "../../data/users.js";
import {
  flushOfflineActions,
  getOfflineActionQueueSize,
} from "../../lib/offlineActions.js";
import { flushOfflineEvents } from "../../lib/feedEvents.js";

export function OfflineTab() {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState("Moi");
  const [p2pInput, setP2pInput] = useState("");
  const [queueSize, setQueueSize] = useState(0);
  const [flushing, setFlushing] = useState(false);

  const {
    isAvailable,
    isNative,
    debug,
    isScanning,
    devices,
    messages,
    error,
    start,
    stop,
    sendMessage,
  } = useNearbyChat(displayName);

  useEffect(() => {
    if (error) showToast(error, "error");
  }, [error, showToast]);

  useEffect(() => {
    const refresh = () => setQueueSize(getOfflineActionQueueSize());
    refresh();
    window.addEventListener("online", refresh);
    const id = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", refresh);
      clearInterval(id);
    };
  }, []);

  const handleFlush = async () => {
    setFlushing(true);
    try {
      await flushOfflineEvents();
      const r = await flushOfflineActions();
      setQueueSize(getOfflineActionQueueSize());
      showToast(
        r.flushed
          ? `${r.flushed} action(s) synchronisée(s).`
          : "File à jour.",
        "success"
      );
    } catch {
      showToast("Synchronisation partielle.", "info");
    } finally {
      setFlushing(false);
    }
  };

  const cacheCount = (() => {
    try {
      return getCachedUsers().length;
    } catch {
      return 0;
    }
  })();

  const offlineFallback = (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full pb-20 p-4">
      <div
        className="rounded-3xl border p-6 space-y-3"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
          >
            <WifiOff size={28} />
          </div>
          <div>
            <h2
              className="text-xl font-bold"
              style={{ color: COLORS.ivory || "#fff" }}
            >
              {isNative
                ? "P2P : plugin Nearby manquant"
                : "P2P indisponible sur le web"}
            </h2>
            <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
              {isNative
                ? "Installe le plugin Nearby, puis npx cap sync android et rebuild l’APK."
                : "Le réseau maillé Bluetooth / Wi‑Fi Direct nécessite l’application Android BAARO."}
            </p>
          </div>
        </div>

        <div
          className="rounded-2xl border p-4 space-y-2"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: COLORS.ivory }}>
            <Inbox size={16} style={{ color: COLORS.teal }} />
            Résilience hors ligne (web)
          </div>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            File d’actions (like, follow…) et événements feed : synchronisés au
            retour du réseau si « Sync hors-ligne » est activé dans Réglages.
          </p>
          <p className="text-xs" style={{ color: COLORS.muted }}>
            Cache profils locaux : <strong>{cacheCount}</strong> entrée(s) · File
            actions : <strong>{queueSize}</strong>
          </p>
          <button
            type="button"
            onClick={handleFlush}
            disabled={flushing}
            className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            <RefreshCw size={14} className={flushing ? "animate-spin" : ""} />
            Synchroniser maintenant
          </button>
        </div>

        {import.meta.env.DEV && (
          <pre
            className="text-[10px] font-mono p-3 rounded-xl overflow-auto"
            style={{ background: COLORS.surface2 || COLORS.surface, color: COLORS.muted }}
          >
            DEBUG: {JSON.stringify(debug, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );

  if (!isAvailable) return offlineFallback;

  const handleToggleScan = async () => {
    if (isScanning) {
      stop();
      showToast("Détection P2P arrêtée.", "info");
    } else {
      try {
        await start();
        showToast("Recherche d'appareils BAARO à proximité…", "info");
      } catch (err) {
        showToast(
          err.message || "Impossible de démarrer la détection.",
          "error"
        );
      }
    }
  };

  const handleSendP2P = (e) => {
    e.preventDefault();
    if (!p2pInput.trim()) return;
    sendMessage(p2pInput.trim())
      .then(() => setP2pInput(""))
      .catch((err) =>
        showToast("Échec de l'envoi : " + err.message, "error")
      );
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-20">
      <div
        className="glass-card rounded-3xl p-6 border shadow-2xl relative overflow-hidden"
        style={{
          borderColor: COLORS.borderTeal,
          background:
            "linear-gradient(135deg, rgba(17,26,44,0.95) 0%, rgba(45,191,166,0.15) 100%)",
        }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: COLORS.tealGlow || "rgba(45,191,166,0.2)",
                color: COLORS.teal,
              }}
            >
              <WifiOff size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className="text-xl font-bold"
                  style={{ color: COLORS.ivory }}
                >
                  Réseau Maillé P2P Hors-Ligne
                </h2>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                  style={{ background: COLORS.teal, color: COLORS.bg }}
                >
                  Bluetooth & Wi‑Fi Direct
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                Échangez sans Internet à proximité.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom visible"
              maxLength={40}
              className="w-full sm:w-48 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.borderTeal, color: COLORS.ivory }}
            />
            <button
              type="button"
              onClick={handleToggleScan}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg"
              style={{
                background: isScanning ? COLORS.gold : COLORS.teal,
                color: COLORS.bg,
              }}
            >
              <Radio
                size={16}
                className={isScanning ? "animate-pulse" : ""}
              />
              <span>
                {isScanning ? "Arrêter la détection" : "Activer détection P2P"}
              </span>
            </button>
          </div>
        </div>

        <div
          className="mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px]"
          style={{
            borderColor: "rgba(217,174,82,0.35)",
            background: "rgba(217,174,82,0.08)",
            color: COLORS.muted,
          }}
        >
          <ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: COLORS.gold }} />
          <span>
            Les messages de proximité transitent en clair sur le canal local
            (Bluetooth / Wi‑Fi Direct). Ce n’est <strong>pas</strong> la
            messagerie E2E chiffrée de BAARO. N’échangez pas de secrets
            sensibles via P2P.
          </span>
        </div>
      </div>

      {/* File de sync même en mode P2P disponible */}
      <div
        className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
      >
        <div className="text-xs" style={{ color: COLORS.muted }}>
          <span className="font-bold" style={{ color: COLORS.ivory }}>
            Sync différée
          </span>
          {" · "}
          {queueSize} action(s) en file · {cacheCount} profil(s) cache
        </div>
        <button
          type="button"
          onClick={handleFlush}
          disabled={flushing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          style={{ background: COLORS.teal, color: COLORS.bg }}
        >
          <RefreshCw size={14} className={flushing ? "animate-spin" : ""} />
          Synchroniser
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="glass-card rounded-2xl p-4 border flex flex-col gap-3 md:col-span-1"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>
              Appareils proches
            </h3>
            <Smartphone size={16} style={{ color: COLORS.muted }} />
          </div>
          {devices.length === 0 ? (
            <p className="text-xs" style={{ color: COLORS.muted }}>
              {isScanning
                ? "Recherche en cours…"
                : "Active la détection pour voir les appareils."}
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-auto">
              {devices.map((d) => (
                <li
                  key={d.endpointId}
                  className="text-xs rounded-lg px-2 py-1.5 border"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                >
                  {d.name || d.endpointId}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="glass-card rounded-2xl p-4 border flex flex-col gap-3 md:col-span-2"
          style={{ borderColor: COLORS.border }}
        >
          <h3 className="text-sm font-bold" style={{ color: COLORS.ivory }}>
            Messages de proximité
          </h3>
          <div className="flex-1 min-h-[120px] max-h-56 overflow-auto space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                Aucun message pour l’instant.
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className="text-xs rounded-lg px-2 py-1.5"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: COLORS.ivory,
                  }}
                >
                  <span className="font-bold" style={{ color: COLORS.teal }}>
                    {m.from || "?"}
                  </span>
                  : {m.text}
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendP2P} className="flex gap-2">
            <input
              value={p2pInput}
              onChange={(e) => setP2pInput(e.target.value)}
              placeholder="Message de proximité…"
              maxLength={500}
              className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl"
              style={{ background: COLORS.teal, color: COLORS.bg }}
              aria-label="Envoyer"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {import.meta.env.DEV && (
        <pre
          className="text-[10px] font-mono p-3 rounded-xl overflow-auto"
          style={{ background: COLORS.surface, color: COLORS.muted }}
        >
          DEBUG: {JSON.stringify(debug, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default OfflineTab;
