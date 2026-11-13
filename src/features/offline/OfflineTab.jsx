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
import { useApp } from "../../contexts/AppContext.jsx";
import { useNearbyChat } from "../../hooks/useNearbyChat.js";
import { useNotificationSound } from "../../hooks/useNotificationSound.js";
import { getCachedUsers } from "../../data/users.js";
import {
  flushOfflineActions,
  getOfflineActionQueueSize,
  getOfflineActionDeadLetterCount,
  clearOfflineActionDeadLetters,
} from "../../lib/offlineActions.js";
import { clearOfflineEventDeadLetters, flushOfflineEvents, getOfflineEventQueueSize, getOfflineEventDeadLetterCount } from "../../lib/feedEvents.js";
import { OfflineSyncDashboard } from "./OfflineSyncDashboard.jsx";

export function OfflineTab() {
  const { showToast } = useToast();
  const { user } = useApp();
  const { playNotification } = useNotificationSound();
  const [displayName, setDisplayName] = useState("Moi");
  const [p2pInput, setP2pInput] = useState("");
  const [queueSize, setQueueSize] = useState(0);
  const [eventQueueSize, setEventQueueSize] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [verifiedConnectionIds, setVerifiedConnectionIds] = useState(() => new Set());

  const {
    isAvailable,
    isNative,
    debug,
    isScanning,
    devices,
    pendingConnections,
    messages,
    error,
    start,
    stop,
    sendMessage,
    requestConnection,
    acceptConnection,
    rejectConnection,
  } = useNearbyChat(displayName);

  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    // Sans argument : respecte le son choisi dans Réglages → Notifications.
    if (!last?.isMe) playNotification();
  }, [messages.length, playNotification]);

  useEffect(() => {
    if (error) showToast(error, "error");
  }, [error, showToast]);

  useEffect(() => {
    const refresh = () => {
      const userId = user?.id;
      setQueueSize(getOfflineActionQueueSize(userId));
      setEventQueueSize(getOfflineEventQueueSize(userId));
      setDeadLetterCount(getOfflineActionDeadLetterCount(userId) + getOfflineEventDeadLetterCount(userId));
    };
    refresh();
    window.addEventListener("online", refresh);
    const id = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", refresh);
      clearInterval(id);
    };
  }, [user?.id]);

  const handleFlush = async () => {
    setFlushing(true);
    try {
      const events = await flushOfflineEvents();
      const r = await flushOfflineActions();
      setQueueSize(getOfflineActionQueueSize(user?.id));
      setEventQueueSize(getOfflineEventQueueSize(user?.id));
      const dead = getOfflineActionDeadLetterCount(user?.id) + getOfflineEventDeadLetterCount(user?.id);
      setDeadLetterCount(dead);
      if (events?.offline || r?.offline) {
        showToast("Hors ligne : les éléments conservés seront synchronisés au retour du réseau.", "info");
        return;
      }
      if (events?.disabled || r?.disabled) {
        showToast("La synchronisation hors ligne est désactivée dans Réglages.", "info");
        return;
      }
      showToast(
        r.flushed || events?.flushed
          ? `${r.flushed || 0} action(s) et ${events?.flushed || 0} événement(s) synchronisé(s).`
          : dead
            ? `${dead} élément(s) nécessitent une intervention.`
            : "Files à jour.",
        dead ? "info" : "success"
      );
    } catch {
      showToast("Synchronisation partielle.", "info");
    } finally {
      setFlushing(false);
    }
  };

  const handleClearDeadLetters = async () => {
    if (!user?.id || deadLetterCount === 0) return;
    if (!window.confirm(`Supprimer ${deadLetterCount} élément(s) définitivement échoué(s) ? Les actions encore en attente seront conservées.`)) return;
    try {
      await Promise.all([clearOfflineActionDeadLetters(user.id), clearOfflineEventDeadLetters(user.id)]);
      setQueueSize(getOfflineActionQueueSize(user.id));
      setEventQueueSize(getOfflineEventQueueSize(user.id));
      setDeadLetterCount(getOfflineActionDeadLetterCount(user.id) + getOfflineEventDeadLetterCount(user.id));
      showToast("Échecs définitifs supprimés.", "success");
    } catch {
      showToast("Impossible de modifier les files locales.", "error");
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
      <OfflineSyncDashboard userId={user?.id} />
      <div
        className="rounded-3xl border p-6 space-y-3"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
      >
        {isNative && (
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
                P2P : plugin Nearby manquant
              </h2>
              <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
                Installe le plugin Nearby, puis npx cap sync android et rebuild
                l’APK.
              </p>
            </div>
          </div>
        )}

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
      } catch {
        // L’erreur est déjà affichée par le toast lié à l’état du hook.
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
      <OfflineSyncDashboard userId={user?.id} />
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
            Nearby chiffre le transport entre appareils, mais BAARO n’ajoute
            pas de chiffrement de bout en bout ni de protection des messages
            après réception. Compare le code affiché sur les deux appareils
            avant d’accepter une connexion et évite les informations sensibles.
          </span>
        </div>
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
                  className="flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 border"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                >
                  <span>{d.name || d.endpointId}</span>
                  {d.status === "connected" ? (
                    <span className="text-[10px]" style={{ color: COLORS.teal }}>Connecté</span>
                  ) : d.status === "connecting" ? (
                    <span className="text-[10px]" style={{ color: COLORS.muted }}>Demande envoyée…</span>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-[10px] font-bold"
                      style={{ background: COLORS.teal, color: COLORS.bg }}
                      onClick={() => requestConnection(d.endpointId).catch(() => {})}
                    >
                      Demander connexion
                    </button>
                  )}
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

      {pendingConnections.length > 0 && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nearby-auth-title"
            className="w-full max-w-md rounded-2xl border p-5 shadow-2xl"
            style={{ borderColor: COLORS.borderTeal, background: COLORS.surface }}
          >
            <h3 id="nearby-auth-title" className="text-lg font-bold" style={{ color: COLORS.ivory }}>
              Confirmer la connexion Nearby
            </h3>
            <p className="mt-2 text-sm" style={{ color: COLORS.muted }}>
              Comparez le code avec l’autre personne par un canal indépendant. N’accepte pas si les codes diffèrent.
            </p>
            <div className="mt-4 space-y-4">
              {pendingConnections.map((request) => {
                const verificationKey = `${request.endpointId}:${request.requestId}`;
                const verified = verifiedConnectionIds.has(verificationKey);
                return (
                  <section key={request.endpointId} className="rounded-xl border p-3" style={{ borderColor: COLORS.border }}>
                    <p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>{request.deviceName}</p>
                    <p className="my-3 text-center font-mono text-2xl tracking-[0.25em]" style={{ color: COLORS.gold }}>
                      {request.authToken || "Code indisponible"}
                    </p>
                    <label className="flex items-start gap-2 text-xs" style={{ color: COLORS.muted }}>
                      <input
                        type="checkbox"
                        checked={verified}
                        disabled={!request.authToken}
                        onChange={(event) => {
                          setVerifiedConnectionIds((previous) => {
                            const next = new Set(previous);
                            if (event.target.checked) next.add(verificationKey);
                            else next.delete(verificationKey);
                            return next;
                          });
                        }}
                      />
                      J’ai comparé le code et il correspond exactement sur les deux appareils.
                    </label>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-2 text-xs"
                        style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                        onClick={() => {
                          setVerifiedConnectionIds((previous) => {
                            const next = new Set(previous);
                            next.delete(verificationKey);
                            return next;
                          });
                          rejectConnection(request.endpointId).catch(() => {});
                        }}
                      >
                        Refuser
                      </button>
                      <button
                        type="button"
                        disabled={!verified}
                        className="rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40"
                        style={{ background: COLORS.teal, color: COLORS.bg }}
                        onClick={() => acceptConnection(request.endpointId, true).catch(() => {})}
                      >
                        Accepter le code vérifié
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
