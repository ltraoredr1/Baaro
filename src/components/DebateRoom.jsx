// src/components/DebateRoom.jsx
// VERSION QUI FONCTIONNE - SANS CHAT PRIVÉ

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

export function DebateRoom({ mode, debate, inviteCode: joinCode, userName, userId, onLeave }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [inviteCode, setInviteCode] = useState(mode === "guest" ? joinCode : null);
  const [participants, setParticipants] = useState({});
  const [micOn, setMicOn] = useState(mode === "host");
  const [camOn, setCamOn] = useState(mode === "host");
  const [copied, setCopied] = useState(false);

  const videoRefs = useRef({});
  const roomNameRef = useRef(null);

  const attachTrack = useCallback((participantId, track) => {
    const el = videoRefs.current[participantId];
    if (!el || !track) return;
    el.srcObject = new MediaStream([track]);
  }, []);

  const refreshParticipants = useCallback(() => {
    const callObject = getCallObject();
    if (!callObject) return;
    const all = callObject.participants();
    setParticipants(all);
    Object.values(all).forEach((p) => {
      if (p.tracks?.video?.track) attachTrack(p.session_id, p.tracks.video.track);
    });
  }, [attachTrack]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        if (mode === "host") {
          const result = await startLive({ userName, debateId: debate?.id });
          if (cancelled) return;
          roomNameRef.current = result.roomName;
          setInviteCode(result.inviteCode);
        } else {
          if (!joinCode) throw new Error("Code d'invitation manquant");
          await joinLiveByCode({ inviteCode: joinCode, userName, isHost: false });
          if (cancelled) return;
          roomNameRef.current = joinCode;
        }

        subscribeToEvents({
          onParticipantJoined: refreshParticipants,
          onParticipantLeft: refreshParticipants,
          onTrackStarted: refreshParticipants,
          onError: (e) => {
            console.error("Erreur Daily:", e);
            if (!cancelled) {
              setStatus("error");
              setErrorMsg("Connexion perdue avec le débat");
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
      leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" });
    };
  }, [mode, joinCode, userName, debate?.id, refreshParticipants]);

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
    await leaveLive({ roomName: roomNameRef.current, isHost: mode === "host" });
    onLeave?.();
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    showToast("Code copié !", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const participantList = Object.values(participants);

  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.gold }} />
        <span className="text-sm" style={{ color: COLORS.muted }}>Connexion au débat…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
        <span className="text-sm font-bold" style={{ color: "#EC4899" }}>{errorMsg}</span>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: COLORS.ivory }}>
            {debate?.title || "Débat en direct"}
          </h2>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.muted }}>
            <Users size={12} />
            <span>
              {participantList.length} participant{participantList.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {mode === "host" && inviteCode && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold, background: COLORS.surface2 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span className="font-mono tracking-widest">{inviteCode}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {participantList.map((p) => (
          <div
            key={p.session_id}
            className="relative aspect-video rounded-xl overflow-hidden border flex items-center justify-center"
            style={{ background: COLORS.surface, borderColor: COLORS.border }}
          >
            <video
              ref={(el) => {
                videoRefs.current[p.session_id] = el;
                if (el && p.tracks?.video?.track) attachTrack(p.session_id, p.tracks.video.track);
              }}
              autoPlay
              playsInline
              muted={p.local}
              className="w-full h-full object-cover"
            />
            <span
              className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: COLORS.ivory }}
            >
              {p.user_name || (p.local ? "Vous" : "Participant")}
            </span>
          </div>
        ))}
      </div>

      <div className="fixed bottom-16 left-0 right-0 flex justify-center gap-3 z-20">
        <button
          onClick={handleToggleMic}
          className="w-12 h-12 rounded-full flex items-center justify-center border"
          style={{
            background: micOn ? COLORS.surface2 : "#EC4899",
            borderColor: COLORS.border,
            color: micOn ? COLORS.ivory : "#fff",
          }}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <button
          onClick={handleToggleCamera}
          className="w-12 h-12 rounded-full flex items-center justify-center border"
          style={{
            background: camOn ? COLORS.surface2 : "#EC4899",
            borderColor: COLORS.border,
            color: camOn ? COLORS.ivory : "#fff",
          }}
        >
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "#EC4899", color: "#fff" }}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
