import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Users, Loader2 } from "lucide-react";

/**
 * Interface vocale simple.
 * Utilise l'API WebRTC native pour un canal vocal basique.
 * Pour Daily.co, remplacez la logique par le SDK DailyIframe.
 */
export default function VoiceChannelUI({ channelId, userId, C }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const localStreamRef = useRef(null);
  const peerRef = useRef(null);

  const join = async () => {
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Muet par défaut
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      setMuted(true);
      setJoined(true);
      setParticipants([{ id: userId, name: "Vous", isLocal: true }]);

      /*
       * NOTE PRODUCTION : Remplacez ce bloc par :
       *   import DailyIframe from '@daily-co/daily-js';
       *   const callFrame = DailyIframe.createFrame({ iframeStyle: { display: 'none' } });
       *   await callFrame.join({ url: `https://baaro.daily.co/${channelId}`, userName: userId });
       *   callFrame.on('participant-joined', ...)
       */
    } catch (e) {
      alert("Impossible d'accéder au microphone : " + e.message);
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    peerRef.current = null;
    setJoined(false);
    setParticipants([]);
    setMuted(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getAudioTracks();
      tracks.forEach((t) => (t.enabled = muted));
      setMuted(!muted);
    }
  };

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (!joined) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ background: "rgba(45,191,166,0.15)" }}>
          <Phone size={32} style={{ color: C.teal }} />
        </div>
        <p className="text-sm" style={{ color: C.muted }}>Canal vocal</p>
        <button type="button" onClick={join} disabled={connecting}
          className="px-6 py-3 rounded-2xl font-bold flex items-center gap-2 disabled:opacity-40"
          style={{ background: C.teal, color: "#000" }}>
          {connecting ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />}
          Rejoindre le vocal
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-4">
      {/* Participants */}
      <div className="flex-1 overflow-y-auto">
        <h4 className="text-xs font-bold mb-3 flex items-center gap-2" style={{ color: C.gold }}>
          <Users size={14} /> En ligne ({participants.length})
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {participants.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-2 p-3 rounded-2xl"
              style={{ background: C.surface2 }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: p.isLocal && !muted ? "rgba(45,191,166,0.3)" : C.border }}>
                <Users size={24} style={{ color: p.isLocal && !muted ? C.teal : C.muted }} />
              </div>
              <span className="text-xs font-bold truncate w-full text-center">{p.name}</span>
              {p.isLocal && muted && (
                <MicOff size={12} style={{ color: "#ef4444" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-center gap-4 pb-4">
        <button type="button" onClick={toggleMute}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all"
          style={{ background: muted ? "#ef4444" : C.gold, color: muted ? "#fff" : "#000" }}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button type="button" onClick={leave}
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "#ef4444", color: "#fff" }}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
        }
