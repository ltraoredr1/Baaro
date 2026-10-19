/**
 * src/features/messaging/components/ChatCallModal.jsx
 * Modal Appel Audio/Video Daily - BAARO
 */
import React, { useEffect, useState, useRef } from "react";
import { startCall, joinCall, leaveCall, subscribeCallEvents, getCallObject, enableMic, enableCamera } from "../lib/calls.js";

export function ChatCallModal({ isOpen, onClose, roomUrl, token, mode = "video", remoteUser }) {
  const [status, setStatus] = useState("connecting");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(mode === "video");
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !roomUrl || !token) return;
    let unsub = () => {};
    (async () => {
      try {
        setStatus("connecting");
        const callObj = await startCall({ roomUrl, token, video: mode === "video" });
        setStatus("connected");
        unsub = subscribeCallEvents({
          onTrackStarted: (e) => {
            if (e.participant?.local) {
              if (videoRef.current && e.track?.kind === "video") videoRef.current.srcObject = new MediaStream([e.track]);
            } else {
              if (remoteVideoRef.current && e.track) {
                const stream = remoteVideoRef.current.srcObject || new MediaStream();
                stream.addTrack(e.track);
                remoteVideoRef.current.srcObject = stream;
              }
            }
          },
          onParticipantLeft: () => setStatus("ended"),
          onLeft: () => { setStatus("ended"); onClose?.(); }
        });
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
    return () => { unsub(); leaveCall(); };
  }, [isOpen, roomUrl, token, mode, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
      <div className="flex-1 relative bg-zinc-900">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <div className="absolute top-4 left-4 text-white">
          <p className="text-sm opacity-70">{status === "connecting" ? "Connexion..." : status === "connected" ? `En appel avec ${remoteUser?.display_name || ""}` : status}</p>
        </div>
        <div className="absolute bottom-24 right-4 w-32 h-44 rounded-xl overflow-hidden border-2 border-white/20 bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="p-6 bg-black flex justify-center gap-4">
        <button onClick={() => { const v = !micOn; setMicOn(v); enableMic(v); }} className={`w-12 h-12 rounded-full ${micOn ? 'bg-zinc-700' : 'bg-red-600'} text-white`}>{micOn ? "🎙️" : "🔇"}</button>
        {mode === "video" && <button onClick={() => { const v = !camOn; setCamOn(v); enableCamera(v); }} className={`w-12 h-12 rounded-full ${camOn ? 'bg-zinc-700' : 'bg-red-600'} text-white`}>📷</button>}
        <button onClick={async () => { await leaveCall(); onClose?.(); }} className="w-14 h-14 rounded-full bg-red-600 text-white text-xl">✕</button>
      </div>
    </div>
  );
}
