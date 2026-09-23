// src/components/ChatCallModal.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { startCall, joinCall, leaveCall, enableMic, enableCamera, subscribeCallEvents, getParticipants, updateCallStatus } from "../lib/chatCalls.js";

const FALLBACK = {
  surface: "#12141F", surface2: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.1)", borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF", muted: "rgba(245,243,239,0.55)", gold: "#D9AE52"
};

export function ChatCallModal({ mode="outgoing", callType="voice", callRecord, roomUrl, token, otherUser={}, isCaller=true, onClose, onAccepted, onRejected }) {
  const C = {...FALLBACK,...(THEME_COLORS||{})};
  const [status, setStatus] = useState(mode);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType==="video");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const mountedRef = useRef(true);

  const cleanupMedia = useCallback(() => {
    clearInterval(timerRef.current);
    const audio = document.getElementById("baaro-call-remote-audio");
    if (audio) { audio.srcObject=null; audio.remove(); }
    if (localVideoRef.current) localVideoRef.current.srcObject=null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject=null;
  }, []);

  const attachTracks = useCallback(() => {
    try {
      const parts = getParticipants();
      Object.values(parts).forEach((p) => {
        if (p.local) {
          const v = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
          if (v && localVideoRef.current) localVideoRef.current.srcObject = new MediaStream([v]);
        } else {
          const v = p.tracks?.video?.persistentTrack || p.tracks?.video?.track;
          const a = p.tracks?.audio?.persistentTrack || p.tracks?.audio?.track;
          if (v && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = new MediaStream([v,a].filter(Boolean));
          } else if (a) {
            let audio = document.getElementById("baaro-call-remote-audio");
            if (!audio) {
              audio = document.createElement("audio");
              audio.id = "baaro-call-remote-audio";
              audio.autoplay = true; audio.playsInline = true;
              document.body.appendChild(audio);
            }
            audio.srcObject = new MediaStream([a]);
          }
        }
      });
    } catch {}
  }, []);

  const endCall = useCallback(async (finalStatus="ended") => {
    clearInterval(timerRef.current);
    const dur = startedAtRef.current? Math.floor((Date.now()-startedAtRef.current)/1000) : 0;
    try { await leaveCall(); } catch {}
    if (callRecord?.id) {
      updateCallStatus(callRecord.id, { status: finalStatus, ended_at: new Date().toISOString(), duration_seconds: dur }).catch(()=>{});
    }
    cleanupMedia();
    if (mountedRef.current) setStatus("ended");
    onClose?.();
  }, [callRecord?.id, cleanupMedia, onClose]);

  // Join caller
  useEffect(() => {
    mountedRef.current = true;
    if (mode!=="outgoing" ||!roomUrl||!token) return;

    let cancelled=false;
    (async () => {
      try {
        await startCall({ roomUrl, token, video: callType==="video" });
        if (cancelled||!mountedRef.current) return;
        subscribeCallEvents({
          onParticipantJoined: () => {
            if (!mountedRef.current) return;
            setStatus("active"); startedAtRef.current=Date.now();
            if (callRecord?.id) updateCallStatus(callRecord.id,{ status:"accepted", started_at:new Date().toISOString() }).catch(()=>{});
            onAccepted?.();
          },
          onParticipantLeft: () => endCall("ended"),
          onTrackStarted: () => attachTracks(),
          onLeft: () => endCall("ended"),
          onError: (e)=> console.warn("Daily error", e),
        });
        setTimeout(attachTracks, 500);
      } catch (e) {
        console.error(e);
        if (!mountedRef.current) return;
        setError(e.message || "Impossible de démarrer l'appel");
        setTimeout(()=>onClose?.(), 1500);
      }
    })();

    return () => { cancelled=true; };
  }, [mode, roomUrl, token, callType, callRecord?.id, attachTracks, endCall, onAccepted, onClose]);

  // Timer
  useEffect(() => {
    if (status!=="active") return;
    timerRef.current=setInterval(()=>{ if(startedAtRef.current) setDuration(Math.floor((Date.now()-startedAtRef.current)/1000)); },1000);
    return ()=>clearInterval(timerRef.current);
  }, [status]);

  // Cleanup unmount
  useEffect(() => {
    return () => { mountedRef.current=false; clearInterval(timerRef.current); cleanupMedia(); leaveCall().catch(()=>{}); };
  }, [cleanupMedia]);

  const acceptIncoming = async () => {
    if (!roomUrl||!token) return;
    try {
      await joinCall({ roomUrl, token, video: callType==="video" });
      setStatus("active"); startedAtRef.current=Date.now();
      if (callRecord?.id) await updateCallStatus(callRecord.id,{ status:"accepted", started_at:new Date().toISOString() });
      subscribeCallEvents({ onParticipantLeft: ()=>endCall("ended"), onTrackStarted: ()=>attachTracks(), onLeft: ()=>endCall("ended") });
      setTimeout(attachTracks,400); onAccepted?.();
    } catch(e){ setError(e.message||"Impossible de rejoindre"); setTimeout(()=>onClose?.(),1200); }
  };

  const rejectIncoming = async () => {
    if (callRecord?.id) await updateCallStatus(callRecord.id,{ status:"rejected", ended_at:new Date().toISOString() }).catch(()=>{});
    onRejected?.(); onClose?.();
  };

  const toggleMic = async () => { try{ await enableMic(!micOn); setMicOn(v=>!v);}catch{} };
  const toggleCam = async () => { try{ await enableCamera(!camOn); setCamOn(v=>!v);}catch{} };
  const formatTime = (s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background:"rgba(0,0,0,0.85)" }}>
      <div className="w-full max-w-md rounded-3xl border overflow-hidden shadow-2xl flex flex-col" style={{ background:C.surface, borderColor:C.borderGold, minHeight: callType==="video"?480:360 }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor:C.border }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl overflow-hidden">
              {otherUser.avatar? <img src={otherUser.avatar} alt="" className="w-full h-full object-cover"/> : otherUser.flag||"🌍"}
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color:C.ivory }}>{otherUser.name||"Membre"}</p>
              <p className="text-xs" style={{ color:C.muted }}>
                {status==="outgoing"&&"Appel en cours…"}
                {status==="incoming"&&(callType==="video"?"Appel vidéo entrant":"Appel vocal entrant")}
                {status==="active"&&formatTime(duration)}
                {status==="ended"&&"Terminé"}
                {error&&<span className="text-red-400 ml-2">{error}</span>}
              </p>
            </div>
          </div>
          <button onClick={()=>endCall("ended")} className="p-2 rounded-full hover:bg-white/10" style={{ color:C.muted }}><X size={20}/></button>
        </div>

        <div className="flex-1 relative flex items-center justify-center bg-black/40 min-h-[200px]">
          {callType==="video"?(
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 w-28 h-40 rounded-xl object-cover border-2" style={{ borderColor:C.gold }} />
            </>
          ):(
            <div className="text-center py-10">
              <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-4xl mx-auto mb-4 overflow-hidden">
                {otherUser.avatar? <img src={otherUser.avatar} alt="" className="w-full h-full object-cover"/> : otherUser.flag||"🌍"}
              </div>
              <p className="text-sm font-semibold" style={{ color:C.ivory }}>{otherUser.name||"Membre"}</p>
              {status==="outgoing"&&<p className="text-xs mt-2 animate-pulse" style={{ color:C.gold }}>Sonnerie…</p>}
            </div>
          )}
        </div>

        <div className="p-5 flex items-center justify-center gap-4">
          {status==="incoming"?(
            <>
              <button onClick={rejectIncoming} className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background:"#EF4444", color:"#fff" }}><PhoneOff size={24}/></button>
              <button onClick={acceptIncoming} className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background:"#22C55E",
