import { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  WifiOff,
  Radio,
  Smartphone,
  Send,
  ShieldCheck,
  RefreshCw,
  Inbox,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  X,
  ExternalLink,
  Mic,
  Phone,
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
import { NearbyCallLayer } from "./NearbyCallLayer.jsx";
import {
  startNearbyCall,
  startNearbyVoiceRecording,
  stopNearbyVoiceRecording,
  cancelNearbyVoiceRecording,
  NEARBY_MAX_VOICE_MS,
} from "../../lib/nearby.js";

const MAX_FILE_MB = 20;

const ATTACH_OPTIONS = [
  { kind: "image", label: "Photo", Icon: ImageIcon },
  { kind: "video", label: "Vidéo", Icon: Video },
  { kind: "document", label: "Document", Icon: FileText },
];

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function errorText(error) {
  return error instanceof Error ? error.message : "Action impossible.";
}

function progressPercent(transfer, fallbackTotal = 0) {
  const total = Number(transfer?.totalBytes) || Number(fallbackTotal) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(((Number(transfer?.bytesTransferred) || 0) / total) * 100)));
}

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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [targetEndpointId, setTargetEndpointId] = useState("");
  const [sendingFile, setSendingFile] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const finishVoiceRef = useRef(null);
  const recordingRef = useRef(false);

  const {
    isAvailable,
    isNative,
    debug,
    isOperating,
    isScanning,
    devices,
    pendingConnections,
    messages,
    transfers,
    error,
    start,
    stop,
    sendMessage,
    pickFile,
    sendFile,
    cancelTransfer,
    openFile,
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
    recordingRef.current = recording;
  }, [recording]);

  // Compteur du vocal, arrêt automatique à la durée maximale.
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => {
      setRecordSeconds((value) => {
        const next = value + 1;
        if (next * 1000 >= NEARBY_MAX_VOICE_MS) finishVoiceRef.current?.(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Quitter l'onglet abandonne l'enregistrement en cours.
  useEffect(() => {
    return () => {
      if (recordingRef.current) void cancelNearbyVoiceRecording();
    };
  }, []);

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
    if (isOperating) return;

    try {
      if (isScanning) {
        await stop();
        showToast("Détection P2P arrêtée.", "info");
      } else {
        await start();
        showToast("Recherche d'appareils BAARO à proximité…", "info");
      }
    } catch {
      // L’erreur est déjà affichée par le toast lié à l’état du hook.
    }
  };

  const handleSendP2P = (e) => {
    e.preventDefault();
    if (!p2pInput.trim()) return;
    sendMessage(p2pInput.trim())
      .then(() => setP2pInput(""))
      .catch(() => {
        // Le hook publie l’erreur via l’état et le toast partagé.
      });
  };

  const connectedDevices = devices.filter((d) => d.status === "connected");
  const activeTransfers = transfers.filter((t) => t.status === "IN_PROGRESS");
  const effectiveTarget =
    connectedDevices.length === 1
      ? connectedDevices[0].endpointId
      : connectedDevices.some((d) => d.endpointId === targetEndpointId)
        ? targetEndpointId
        : "";

  const handleAttach = async (kind) => {
    setAttachMenuOpen(false);
    if (sendingFile) return;
    if (!isScanning) {
      showToast("Active la détection P2P avant d'envoyer un fichier.", "info");
      return;
    }
    if (connectedDevices.length === 0) {
      showToast("Connecte-toi d'abord à un appareil proche.", "info");
      return;
    }
    if (!effectiveTarget) {
      showToast("Choisis l'appareil destinataire.", "info");
      return;
    }

    setSendingFile(true);
    try {
      const file = await pickFile(kind);
      if (!file) return; // sélection annulée
      await sendFile(file, effectiveTarget);
      showToast(`Envoi de « ${file.name} » en cours…`, "info");
    } catch {
      // Le hook publie l’erreur via l’état et le toast partagé.
    } finally {
      setSendingFile(false);
    }
  };

  const handleCancelTransfer = (payloadId) => {
    cancelTransfer(payloadId).catch(() => {});
  };

  const handleOpenFile = (message) => {
    openFile(message.path, message.mimeType).catch(() => {});
  };

  const handleCall = (endpointId, media) => {
    startNearbyCall(media, endpointId).catch((error) =>
      showToast(errorText(error), "error")
    );
  };

  const handleVoiceStart = async () => {
    if (recording || sendingFile) return;
    if (!isScanning) {
      showToast("Active la détection P2P avant d'enregistrer un vocal.", "info");
      return;
    }
    if (connectedDevices.length === 0) {
      showToast("Connecte-toi d'abord à un appareil proche.", "info");
      return;
    }
    if (!effectiveTarget) {
      showToast("Choisis l'appareil destinataire.", "info");
      return;
    }
    try {
      await startNearbyVoiceRecording();
      setRecordSeconds(0);
      setRecording(true);
    } catch (error) {
      showToast(errorText(error), "error");
    }
  };

  const finishVoice = async (send) => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    if (!send) {
      await cancelNearbyVoiceRecording();
      return;
    }
    setSendingFile(true);
    let file = null;
    try {
      file = await stopNearbyVoiceRecording();
    } catch (error) {
      showToast(errorText(error), "error");
    }
    try {
      if (file) {
        await sendFile(file, effectiveTarget);
        showToast("Envoi du vocal en cours…", "info");
      }
    } catch {
      // Le hook publie l’erreur via l’état et le toast partagé.
    } finally {
      setSendingFile(false);
    }
  };
  finishVoiceRef.current = finishVoice;

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
              disabled={isOperating}
              aria-busy={isOperating}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg disabled:opacity-60"
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
                {isOperating
                  ? isScanning
                    ? "Arrêt en cours…"
                    : "Démarrage…"
                  : isScanning
                    ? "Arrêter la détection"
                    : "Activer détection P2P"}
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
                    <span className="flex items-center gap-1">
                      <span className="text-[10px]" style={{ color: COLORS.teal }}>Connecté</span>
                      <button
                        type="button"
                        onClick={() => handleCall(d.endpointId, "audio")}
                        className="rounded-lg p-1.5"
                        style={{ background: COLORS.teal, color: COLORS.bg }}
                        aria-label={`Appel vocal avec ${d.name || "cet appareil"}`}
                      >
                        <Phone size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCall(d.endpointId, "video")}
                        className="rounded-lg p-1.5"
                        style={{ background: COLORS.teal, color: COLORS.bg }}
                        aria-label={`Appel vidéo avec ${d.name || "cet appareil"}`}
                      >
                        <Video size={12} />
                      </button>
                    </span>
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
              messages.map((m, i) => {
                if (m.type !== "file") {
                  return (
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
                  );
                }

                const transfer = transfers.find((t) => t.payloadId === m.payloadId);
                const status = transfer?.status;
                const percent = progressPercent(transfer, m.size);
                const isAudio = typeof m.mimeType === "string" && m.mimeType.startsWith("audio/");
                const canOpen = !m.isMe && Boolean(m.path);
                let stateLabel = "";
                if (status === "IN_PROGRESS") stateLabel = `${percent} %`;
                else if (status === "CANCELED") stateLabel = "Annulé";
                else if (status === "FAILURE") stateLabel = "Échec";
                else if (m.isMe && status === "SUCCESS") stateLabel = "Envoyé";
                else if (m.isMe && !status) stateLabel = "Envoi…";

                return (
                  <div
                    key={i}
                    className="text-xs rounded-lg px-2 py-1.5 flex items-center gap-2"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      color: COLORS.ivory,
                    }}
                  >
                    {isAudio ? (
                      <Mic size={16} className="shrink-0" style={{ color: COLORS.teal }} />
                    ) : (
                      <FileText size={16} className="shrink-0" style={{ color: COLORS.teal }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-bold" style={{ color: COLORS.teal }}>
                          {m.from || "?"}
                        </span>
                        : {m.fileName}
                      </div>
                      <div className="text-[10px]" style={{ color: COLORS.muted }}>
                        {formatBytes(m.size)}
                        {stateLabel ? ` · ${stateLabel}` : ""}
                      </div>
                    </div>
                    {isAudio && m.path && (
                      <audio
                        controls
                        preload="none"
                        src={Capacitor.convertFileSrc(`file://${m.path}`)}
                        className="h-8 w-40 shrink-0"
                        aria-label={`Écouter ${m.fileName}`}
                      />
                    )}
                    {canOpen && !isAudio && (
                      <button
                        type="button"
                        onClick={() => handleOpenFile(m)}
                        className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold"
                        style={{ background: COLORS.teal, color: COLORS.bg }}
                        aria-label={`Ouvrir ${m.fileName}`}
                      >
                        <ExternalLink size={12} />
                        Ouvrir
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {activeTransfers.length > 0 && (
            <ul className="space-y-2" aria-label="Transferts en cours">
              {activeTransfers.map((t) => {
                const percent = progressPercent(t);
                return (
                  <li
                    key={t.payloadId}
                    className="rounded-lg border px-2 py-1.5 text-xs"
                    style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {t.direction === "outgoing" ? "Envoi" : "Réception"} · {t.fileName || "fichier"}
                      </span>
                      <span className="shrink-0 font-bold" style={{ color: COLORS.gold }}>
                        {percent} %
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelTransfer(t.payloadId)}
                        className="shrink-0 rounded-lg border px-2 py-1 text-[10px] flex items-center gap-1"
                        style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                        aria-label="Annuler le transfert"
                      >
                        <X size={12} />
                        Annuler
                      </button>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.1)" }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percent}%`, background: COLORS.teal }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {connectedDevices.length > 1 && (
            <select
              value={effectiveTarget}
              onChange={(e) => setTargetEndpointId(e.target.value)}
              aria-label="Destinataire du fichier"
              className="bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            >
              <option value="" style={{ color: "#000" }}>
                Destinataire du fichier…
              </option>
              {connectedDevices.map((d) => (
                <option key={d.endpointId} value={d.endpointId} style={{ color: "#000" }}>
                  {d.name || d.endpointId}
                </option>
              ))}
            </select>
          )}
          {recording && (
            <div
              className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
              style={{ borderColor: "#ef4444", color: COLORS.ivory }}
              role="status"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Enregistrement… {formatClock(recordSeconds)}
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => finishVoice(false)}
                  className="rounded-lg border px-2 py-1 text-[10px]"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => finishVoice(true)}
                  className="rounded-lg px-2 py-1 text-[10px] font-bold"
                  style={{ background: COLORS.teal, color: COLORS.bg }}
                >
                  Envoyer
                </button>
              </span>
            </div>
          )}
          <form onSubmit={handleSendP2P} className="flex gap-2 relative">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachMenuOpen((open) => !open)}
                disabled={isOperating || sendingFile || !isScanning}
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen}
                aria-label="Joindre un fichier"
                className="px-3 py-2 rounded-xl border disabled:opacity-50"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              >
                <Paperclip size={16} />
              </button>
              {attachMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 mb-2 z-10 w-44 rounded-xl border p-1 shadow-2xl"
                  style={{ borderColor: COLORS.borderTeal, background: COLORS.surface }}
                >
                  {ATTACH_OPTIONS.map(({ kind, label, Icon }) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={() => handleAttach(kind)}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left"
                      style={{ color: COLORS.ivory }}
                    >
                      <Icon size={14} style={{ color: COLORS.teal }} />
                      {label}
                    </button>
                  ))}
                  <p className="px-3 pt-1 pb-1.5 text-[10px]" style={{ color: COLORS.muted }}>
                    Maximum {MAX_FILE_MB} Mo par fichier.
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleVoiceStart}
              disabled={isOperating || sendingFile || recording || !isScanning}
              aria-label="Enregistrer un message vocal"
              className="px-3 py-2 rounded-xl border disabled:opacity-50"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            >
              <Mic size={16} />
            </button>
            <input
              value={p2pInput}
              onChange={(e) => setP2pInput(e.target.value)}
              disabled={isOperating}
              placeholder="Message de proximité…"
              maxLength={500}
              className="flex-1 bg-transparent border rounded-xl px-3 py-2 text-xs outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <button
              type="submit"
              disabled={isOperating}
              className="px-3 py-2 rounded-xl"
              style={{ background: COLORS.teal, color: COLORS.bg }}
              aria-label="Envoyer"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      <NearbyCallLayer showToast={showToast} onIncomingCall={playNotification} />

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
