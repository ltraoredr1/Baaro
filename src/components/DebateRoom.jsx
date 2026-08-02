// src/components/DebateRoom.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Copy, Check, Users, Loader2 } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import {
  startLive,
  joinLiveByCode,
  leaveLive,
  enableMic,
  enableCamera,
  subscribeToEvents,
  getCallObject,
} from "../lib/webrtc.js";

export function DebateRoom({ mode, room, inviteCode: customInviteCode, userName, userId, onLeave }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Utilise soit le code d'invitation passé, soit celui de la room
  const joinCode = customInviteCode || room?.code || room?.id;
  const [inviteCode, setInviteCode] = useState(mode === "guest" ? joinCode : null);
  
  const [participants, setParticipants] = useState({});
  const [micOn, setMicOn] = useState(mode === "host");
  const [camOn, setCamOn] = useState(mode === "host");
  const [copied, setCopied] = useState(false);

  const videoRefs = useRef({});
  const roomNameRef = useRef(null);

  // Attacher le flux vidéo à la balise HTML <video>
  const attachTrack = useCallback((participantId, track) => {
    const el = videoRefs.current[participantId];
    if (!el || !track) return;
    if (el.srcObject?.getVideoTracks()[0] !== track) {
      el.srcObject = new MediaStream([track]);
    }
  }, []);

  // Rafraîchir la liste des participants
  const refreshParticipants = useCallback(() => {
    const callObject = getCallObject();
    if (!callObject) return;
    const all = callObject.participants();
    setParticipants({ ...all });

    // Attacher les tracks après mise à jour
    Object.values(all).forEach((p) => {
      if (p.tracks?.video?.persistentTrack) {
        attachTrack(p.session_id, p.tracks.video.persistentTrack);
      } else if (p.tracks?.video?.track) {
        attachTrack(p.session_id, p.tracks.video.track);
      }
    });
  }, [attachTrack]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        if (mode === "host") {
          const result = await startLive({ userName, debateId: room?.id });
          if (cancelled) return;
          roomNameRef.current = result?.roomName || room?.id;
          setInviteCode(result?.inviteCode || room?.code);
        } else {
          if (!joinCode) throw new Error("Code d'invitation ou identifiant de salon manquant");
          await joinLiveByCode({ inviteCode: joinCode, userName, isHost: false });
          if (cancelled) return;
          roomNameRef.current = joinCode;
        }

        subscribeToEvents({
          onParticipantJoined: refreshParticipants,
          onParticipantLeft: refreshParticipants,
          onTrackStarted: refreshParticipants,
          onTrackStopped: refreshParticipants,
          onError: (e) => {
            console.error("Erreur WebRTC/Daily:", e);
            if (!cancelled) {
              setStatus("error");
              setErrorMsg("Connexion perdue avec l'arène de débat");
            }
          },
        });

        refreshParticipants();
        if (!cancelled) setStatus("live");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(err.message || "Impossible de rejoindre le débat");
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (roomNameRef.current) {
        leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" }).catch(console.error);
      }
    };
  }, [mode, joinCode, userName, room?.id, refreshParticipants]);

  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    enableMic(next);
  };

  const handleToggleCamera = () => {
    const next = !camOn;
    setCamOn(next);
    enableCamera(next);
  };

  const handleLeave = async () => {
    try {
      await leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" });
    } catch (e) {
      console.error(e);
    } finally {
      onLeave?.();
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      showToast("Code de salon copié !", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      showToast("Impossible de copier le code", "error");
    }
  };

  const participantList = Object.values(participants);

  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.gold }} />
        <span className="text-sm" style={{ color: COLORS.muted }}>Connexion à l'arène en direct…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
        <span className="text-sm font-bold" style={{ color: "#EF4444" }}>{errorMsg}</span>
        <button
          onClick={onLeave}
          className="px-4 py-2 rounded-xl text-xs font-bold"
          style={{ background: COLORS.gold, color: COLORS.bg }}
        >
          Retour aux débats
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full pb-24">
      {/* En-tête de la room */}
      <div className="flex items-center justify-between p-2 rounded-xl border" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: COLORS.ivory }}>
            {room?.title || "Débat en direct"}
          </h2>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.muted }}>
            <Users size={12} />
            <span>
              {participantList.length} participant{participantList.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {inviteCode && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold, background: COLORS.surface2 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span className="font-mono tracking-widest">{inviteCode}</span>
          </button>
        )}
      </div>

      {/* Grille Vidéo des participants */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {participantList.map((p) => (
          <div
            key={p.session_id}
            className="relative aspect-video rounded-xl overflow-hidden border flex items-center justify-center"
            style={{ background: COLORS.bg, borderColor: COLORS.border }}
          >
            <video
              ref={(el) => {
                videoRefs.current[p.session_id] = el;
              }}
              autoPlay
              playsInline
              muted={p.local}
              className="w-full h-full object-cover"
            />
            <span
              className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md"
              style={{ background: "rgba(0,0,0,0.6)", color: COLORS.ivory }}
            >
              {p.user_name || (p.local ? "Vous" : "Participant")}
            </span>
          </div>
        ))}
      </div>

      {/* Barre de contrôle flottante */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-4 z-30">
        <button
          onClick={handleToggleMic}
          className="w-12 h-12 rounded-full flex items-center justify-center border shadow-lg transition active:scale-95"
          style={{
            background: micOn ? COLORS.surface2 : "#EF4444",
            borderColor: COLORS.border,
            color: micOn ? COLORS.ivory : "#fff",
          }}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <button
          onClick={handleToggleCamera}
          className="w-12 h-12 rounded-full flex items-center justify-center border shadow-lg transition active:scale-95"
          style={{
            background: camOn ? COLORS.surface2 : "#EF4444",
            borderColor: COLORS.border,
            color: camOn ? COLORS.ivory : "#fff",
          }}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition active:scale-95"
          style={{ background: "#EF4444", color: "#fff" }}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
