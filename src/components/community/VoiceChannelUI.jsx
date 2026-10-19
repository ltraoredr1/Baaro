
import { useCallback, useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Users,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  getCallToken,
  joinCall,
  leaveCall,
  enableMic,
  getParticipants,
  subscribeCallEvents,
} from "../../features/messaging/lib/chatCalls.js";

function getParticipantList() {
  const participants = getParticipants();

  return Object.values(participants || {}).map((participant) => ({
    id: participant.session_id || participant.user_id || "participant",
    name:
      participant.user_name ||
      (participant.local ? "Vous" : "Participant"),
    isLocal: !!participant.local,
    audio: !!participant.audio,
  }));
}

export default function VoiceChannelUI({ channelId, user_id, C }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState("");

  const refreshParticipants = useCallback(() => {
    setParticipants(getParticipantList());
  }, []);

  const join = async () => {
    if (!channelId || !user_id || connecting || joined) return;

    setConnecting(true);
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Le microphone n'est pas disponible. Utilise une connexion HTTPS et vérifie les permissions du navigateur."
        );
      }

      // Le serveur doit vérifier l'appartenance au groupe avant
      // de renvoyer un jeton Daily pour ce canal vocal.
      const result = await getCallToken({
        roomName: `community-${channelId}`,
        userName: user_id,
        isOwner: false,
      });

      if (!result?.token || !result?.url) {
        throw new Error(
          "Le serveur n'a pas fourni de jeton et d'adresse Daily valides."
        );
      }

      await joinCall({
        roomUrl: result.url,
        token: result.token,
        video: false,
      });

      await enableMic(false);
      setMuted(true);
      setJoined(true);
      refreshParticipants();
    } catch (err) {
      console.error("[community voice] join:", err);
      setError(err?.message || "Impossible de rejoindre le canal vocal.");

      try {
        await leaveCall();
      } catch (cleanupError) {
        console.warn("[community voice] cleanup:", cleanupError);
      }
    } finally {
      setConnecting(false);
    }
  };

  const leave = useCallback(async () => {
    setConnecting(false);
    setError("");

    try {
      await leaveCall();
    } catch (err) {
      console.error("[community voice] leave:", err);
      setError(err?.message || "Erreur lors de la déconnexion.");
    } finally {
      setJoined(false);
      setMuted(true);
      setParticipants([]);
    }
  }, []);

  const toggleMute = async () => {
    try {
      const nextMuted = !muted;
      await enableMic(!nextMuted);
      setMuted(nextMuted);
      refreshParticipants();
    } catch (err) {
      console.error("[community voice] microphone:", err);
      setError(err?.message || "Impossible de modifier le microphone.");
    }
  };

  useEffect(() => {
    if (!joined) return undefined;

    const unsubscribe = subscribeCallEvents({
      onParticipantJoined: refreshParticipants,
      onParticipantLeft: refreshParticipants,
      onTrackStarted: refreshParticipants,
      onTrackStopped: refreshParticipants,
      onError: (event) => {
        setError(
          event?.errorMsg ||
            event?.error?.message ||
            "Erreur de connexion Daily."
        );
      },
      onLeft: () => {
        setJoined(false);
        setMuted(true);
        setParticipants([]);
      },
    });

    refreshParticipants();

    return () => {
      unsubscribe?.();
    };
  }, [joined, refreshParticipants]);

  useEffect(() => {
    return () => {
      // Évite de laisser un appel actif si l'utilisateur change de canal.
      leaveCall().catch((err) => {
        console.warn("[community voice] unmount:", err);
      });
    };
  }, [channelId]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-5">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "rgba(45,191,166,0.15)" }}
      >
        <Phone size={32} style={{ color: C.teal }} />
      </div>

      <div className="text-center">
        <h3 className="font-bold text-lg" style={{ color: C.ivory }}>
          Canal vocal
        </h3>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          {joined
            ? `${participants.length} participant(s) connecté(s)`
            : "Rejoins le salon pour parler avec les membres."}
        </p>
      </div>

      {error && (
        <div
          className="w-full max-w-lg p-3 rounded-xl text-sm flex items-start gap-2"
          role="alert"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "#f87171",
          }}
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {joined && (
        <div className="w-full max-w-lg">
          <h4
            className="text-xs font-bold mb-3 flex items-center gap-2"
            style={{ color: C.gold }}
          >
            <Users size={14} />
            Participants
          </h4>

          {participants.length === 0 ? (
            <p className="text-sm" style={{ color: C.muted }}>
              Connexion en cours des participants…
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl min-w-0"
                  style={{ background: C.surface2 }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background:
                        participant.isLocal && !muted
                          ? "rgba(45,191,166,0.3)"
                          : C.border,
                    }}
                  >
                    {participant.isLocal && muted ? (
                      <MicOff size={20} style={{ color: C.muted }} />
                    ) : (
                      <Users size={20} style={{ color: C.teal }} />
                    )}
                  </div>

                  <span className="text-xs font-bold truncate max-w-full">
                    {participant.name}
                    {participant.isLocal ? " (vous)" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!joined ? (
        <button
          type="button"
          onClick={join}
          disabled={connecting}
          className="px-6 py-3 rounded-2xl font-bold flex items-center gap-2 disabled:opacity-40"
          style={{ background: C.teal, color: "#000" }}
        >
          {connecting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Phone size={18} />
          )}
          {connecting ? "Connexion…" : "Rejoindre le vocal"}
        </button>
      ) : (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={toggleMute}
            className="p-4 rounded-full"
            style={{
              background: muted ? C.surface2 : C.teal,
              color: muted ? C.ivory : "#000",
              border: `1px solid ${C.border}`,
            }}
            aria-label={muted ? "Activer le microphone" : "Couper le microphone"}
            title={muted ? "Activer le microphone" : "Couper le microphone"}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            type="button"
            onClick={leave}
            className="p-4 rounded-full"
            style={{ background: "#dc2626", color: "#fff" }}
            aria-label="Quitter le canal vocal"
            title="Quitter le canal vocal"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
