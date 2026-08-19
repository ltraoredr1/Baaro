// src/components/ChatCallModal.jsx
// Modal d'appel vocal / vidéo 1-1

import { useEffect, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
} from "lucide-react";
import { COLORS } from "../theme.js";
import {
  startCall,
  joinCall,
  leaveCall,
  enableMic,
  enableCamera,
  subscribeCallEvents,
  getParticipants,
  updateCallStatus,
} from "../lib/chatCalls.js";

/**
 * props:
 * - mode: "outgoing" | "incoming" | "active"
 * - callType: "voice" | "video"
 * - callRecord: { id, daily_room_name, ... }
 * - roomUrl, token
 * - otherUser: { name, avatar, flag }
 * - isCaller: boolean
 * - onClose()
 * - onAccepted?()
 * - onRejected?()
 */
export function ChatCallModal({
  mode = "outgoing",
  callType = "voice",
  callRecord,
  roomUrl,
  token,
  otherUser = {},
  isCaller = true,
  onClose,
  onAccepted,
  onRejected,
}) {
  const [status, setStatus] = useState(mode); // outgoing | incoming | active | ended
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [duration, setDuration] = useState(0);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);

  // Joindre l'appel côté caller dès l'ouverture
  useEffect(() => {
    if (status !== "outgoing" || !roomUrl || !token) return;

    let cancelled = false;
    (async () => {
      try {
        await startCall({
          roomUrl,
          token,
          video: callType === "video",
        });
        if (cancelled) return;

        subscribeCallEvents({
          onParticipantJoined: () => {
            setStatus("active");
            startedAtRef.current = Date.now();
            if (callRecord?.id) {
              updateCallStatus(callRecord.id, {
                status: "accepted",
                started_at: new Date().toISOString(),
              }).catch(() => {});
            }
            onAccepted?.();
          },
          onParticipantLeft: () => {
            endCall("ended");
          },
          onTrackStarted: (ev) => {
            attachTracks();
          },
          onLeft: () => endCall("ended"),
          onError: (e) => console.warn("Daily error", e),
        });

        // Attache tracks existants
        setTimeout(attachTracks, 500);
      } catch (e) {
        console.error(e);
        alert(e.message || "Impossible de démarrer l'appel");
        onClose?.();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer durée
  useEffect(() => {
    if (status !== "active") return;
    timerRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  function attachTracks() {
    const parts = getParticipants();
    Object.values(parts).forEach((p) => {
      if (p.local) {
        const v = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
        if (v && localVideoRef.current) {
          localVideoRef.current.srcObject = new MediaStream([v]);
        }
      } else {
        const v = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
        const a = p.tracks?.audio?.persistentTrack || p.tracks?.audio?.track;
        if (v && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = new MediaStream(
            [v, a].filter(Boolean)
          );
        } else if (a) {
          // audio only : élément caché
          let audio = document.getElementById("baaro-call-remote-audio");
          if (!audio) {
            audio = document.createElement("audio");
            audio.id = "baaro-call-remote-audio";
            audio.autoplay = true;
            audio.playsInline = true;
            document.body.appendChild(audio);
          }
          audio.srcObject = new MediaStream([a]);
        }
      }
    });
  }

  async function acceptIncoming() {
    if (!roomUrl || !token) return;
    try {
      await joinCall({
        roomUrl,
        token,
        video: callType === "video",
      });
      setStatus("active");
      startedAtRef.current = Date.now();
      if (callRecord?.id) {
        await updateCallStatus(callRecord.id, {
          status: "accepted",
          started_at: new Date().toISOString(),
        });
      }
      subscribeCallEvents({
        onParticipantLeft: () => endCall("ended"),
        onTrackStarted: () => attachTracks(),
        onLeft: () => endCall("ended"),
      });
      setTimeout(attachTracks, 400);
      onAccepted?.();
    } catch (e) {
      console.error(e);
      alert(e.message || "Impossible de rejoindre");
      onClose?.();
    }
  }

  async function rejectIncoming() {
    if (callRecord?.id) {
      await updateCallStatus(callRecord.id, {
        status: "rejected",
        ended_at: new Date().toISOString(),
      }).catch(() => {});
    }
    onRejected?.();
    onClose?.();
  }

  async function endCall(finalStatus = "ended") {
    clearInterval(timerRef.current);
    const dur = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : 0;
    await leaveCall();
    if (callRecord?.id) {
      await updateCallStatus(callRecord.id, {
        status: finalStatus,
        ended_at: new Date().toISOString(),
        duration_seconds: dur,
      }).catch(() => {});
    }
    const audio = document.getElementById("baaro-call-remote-audio");
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    setStatus("ended");
    onClose?.();
  }

  async function toggleMic() {
    const next = !micOn;
    await enableMic(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const next = !camOn;
    await enableCamera(next);
    setCamOn(next);
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl border overflow-hidden shadow-2xl flex flex-col"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.borderGold,
          minHeight: callType === "video" ? 480 : 360,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl overflow-hidden">
              {otherUser.avatar ? (
                <img src={otherUser.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                otherUser.flag || "🌍"
              )}
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
                {otherUser.name || "Membre"}
              </p>
              <p className="text-xs" style={{ color: COLORS.muted }}>
                {status === "outgoing" && "Appel en cours…"}
                {status === "incoming" && (callType === "video" ? "Appel vidéo entrant" : "Appel vocal entrant")}
                {status === "active" && formatTime(duration)}
                {status === "ended" && "Terminé"}
              </p>
            </div>
          </div>
          <button
            onClick={() => endCall("ended")}
            className="p-2 rounded-full hover:bg-white/10"
            style={{ color: COLORS.muted }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Zone vidéo / avatar */}
        <div className="flex-1 relative flex items-center justify-center bg-black/40 min-h-[200px]">
          {callType === "video" ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 w-28 h-40 rounded-xl object-cover border-2"
                style={{ borderColor: COLORS.gold }}
              />
            </>
          ) : (
            <div className="text-center py-10">
              <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-4xl mx-auto mb-4 overflow-hidden">
                {otherUser.avatar ? (
                  <img src={otherUser.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  otherUser.flag || "🌍"
                )}
              </div>
              <p className="text-sm font-semibold" style={{ color: COLORS.ivory }}>
                {otherUser.name || "Membre"}
              </p>
              {status === "outgoing" && (
                <p className="text-xs mt-2 animate-pulse" style={{ color: COLORS.gold }}>
                  Sonnerie…
                </p>
              )}
            </div>
          )}
        </div>

        {/* Contrôles */}
        <div className="p-5 flex items-center justify-center gap-4">
          {status === "incoming" ? (
            <>
              <button
                onClick={rejectIncoming}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "#EF4444", color: "#fff" }}
                title="Refuser"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={acceptIncoming}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "#22C55E", color: "#fff" }}
                title="Accepter"
              >
                <Phone size={24} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMic}
                className="w-12 h-12 rounded-full flex items-center justify-center border"
                style={{
                  background: micOn ? COLORS.surface2 : "rgba(239,68,68,0.3)",
                  borderColor: COLORS.border,
                  color: micOn ? COLORS.ivory : "#EF4444",
                }}
              >
                {micOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              {callType === "video" && (
                <button
                  onClick={toggleCam}
                  className="w-12 h-12 rounded-full flex items-center justify-center border"
                  style={{
                    background: camOn ? COLORS.surface2 : "rgba(239,68,68,0.3)",
                    borderColor: COLORS.border,
                    color: camOn ? COLORS.ivory : "#EF4444",
                  }}
                >
                  {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              )}

              <button
                onClick={() => endCall("ended")}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "#EF4444", color: "#fff" }}
                title="Raccrocher"
              >
                <PhoneOff size={24} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
