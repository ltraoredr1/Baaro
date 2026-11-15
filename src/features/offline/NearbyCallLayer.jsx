import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Video } from "lucide-react";
import { COLORS } from "../../theme.js";
import {
  onNearbyEvent,
  answerNearbyCall,
  endNearbyCall,
  setNearbyCallMuted,
  setNearbyCallSpeaker,
  sendNearbyVideoFrame,
} from "../../lib/nearby.js";

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const FRAME_INTERVAL_MS = 120; // ~8 images par seconde
const MAX_FRAME_CHARS = 26_000; // marge sous la limite native de 28 000 caractères

const END_MESSAGES = {
  remote: "L’appel est terminé.",
  rejected: "Appel refusé.",
  busy: "Votre correspondant est déjà en ligne.",
  timeout: "Pas de réponse.",
  lost: "Connexion perdue avec l’appareil.",
  error: "L’appel a été interrompu.",
};

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function errorText(error) {
  return error instanceof Error ? error.message : "Action impossible.";
}

/**
 * Écran d'appel Nearby (vocal ou vidéo). L'audio est géré par le plugin natif ;
 * la vidéo est envoyée sous forme d'images JPEG compressées, sans Internet.
 */
export function NearbyCallLayer({ showToast, onIncomingCall }) {
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const callRef = useRef(null);
  const remoteImageRef = useRef(null);
  const localVideoRef = useRef(null);
  const showToastRef = useRef(showToast);
  const onIncomingRef = useRef(onIncomingCall);

  useEffect(() => {
    showToastRef.current = showToast;
    onIncomingRef.current = onIncomingCall;
  });

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    const subscription = onNearbyEvent("nearbyEvent", (event) => {
      if (event.type === "CALL_STATE") {
        setCall({
          callId: event.callId,
          endpointId: event.endpointId,
          deviceName: event.deviceName,
          media: event.media,
          state: event.state,
          incoming: event.incoming,
        });
        if (event.state === "ringing_in") onIncomingRef.current?.();
        if (event.state === "active") setSeconds(0);
      } else if (event.type === "CALL_ENDED") {
        if (callRef.current && callRef.current.callId !== event.callId) return;
        setCall(null);
        setMuted(false);
        setSpeaker(false);
        const message = END_MESSAGES[event.reason];
        if (message) showToastRef.current?.(message, "info");
      } else if (event.type === "VIDEO_FRAME") {
        const current = callRef.current;
        if (!current || current.callId !== event.callId || !event.data) return;
        if (remoteImageRef.current) {
          remoteImageRef.current.src = `data:image/jpeg;base64,${event.data}`;
        }
      }
    });
    return () => {
      void subscription.remove();
    };
  }, []);

  const isActive = call?.state === "active";
  const isVideo = call?.media === "video";

  // Durée de l'appel.
  useEffect(() => {
    if (!isActive) return undefined;
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // Un appel vidéo passe par le haut-parleur par défaut.
  useEffect(() => {
    if (!isActive || !isVideo) return;
    setSpeaker(true);
    setNearbyCallSpeaker(true).catch(() => setSpeaker(false));
  }, [isActive, isVideo]);

  // Capture caméra → images JPEG envoyées à l'autre appareil.
  useEffect(() => {
    if (!isActive || !isVideo) return undefined;

    let stopped = false;
    let stream = null;
    let timer = null;
    let inFlight = false;
    let quality = 0.5;

    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const context = canvas.getContext("2d");
    const camera = document.createElement("video");
    camera.muted = true;
    camera.playsInline = true;

    const tick = async () => {
      if (stopped) return;
      if (!inFlight && camera.readyState >= 2) {
        inFlight = true;
        try {
          context.drawImage(camera, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
          if (data.length > MAX_FRAME_CHARS) {
            // Image trop lourde : on baisse la qualité au lieu de l'envoyer.
            quality = Math.max(0.2, quality - 0.1);
          } else {
            await sendNearbyVideoFrame(data);
            if (data.length < 14_000) quality = Math.min(0.7, quality + 0.05);
          }
        } catch {
          // Une image perdue n'interrompt pas l'appel.
        } finally {
          inFlight = false;
        }
      }
      timer = setTimeout(tick, FRAME_INTERVAL_MS);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: FRAME_WIDTH },
            height: { ideal: FRAME_HEIGHT },
          },
          audio: false,
        });
      } catch {
        showToastRef.current?.("Caméra indisponible : l’appel continue sans image.", "info");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      camera.srcObject = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      try {
        await camera.play();
      } catch {
        // La lecture démarre dès que la caméra fournit des images.
      }
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      camera.srcObject = null;
    };
  }, [isActive, isVideo]);

  if (!call) return null;

  const handleAccept = () => {
    answerNearbyCall(call.callId, true).catch((error) =>
      showToast?.(errorText(error), "error")
    );
  };

  const handleDecline = () => {
    answerNearbyCall(call.callId, false).catch((error) =>
      showToast?.(errorText(error), "error")
    );
  };

  const handleEnd = () => {
    endNearbyCall().catch((error) => showToast?.(errorText(error), "error"));
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    setNearbyCallMuted(next).catch(() => setMuted(!next));
  };

  const handleToggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    setNearbyCallSpeaker(next).catch(() => setSpeaker(!next));
  };

  const kindLabel = isVideo ? "vidéo" : "vocal";
  let statusLabel = "";
  if (call.state === "ringing_in") statusLabel = `Appel ${kindLabel} entrant…`;
  else if (call.state === "ringing_out") statusLabel = "Appel en cours… En attente de réponse";
  else statusLabel = formatDuration(seconds);

  const buttonBase =
    "w-14 h-14 rounded-full flex items-center justify-center shadow-lg disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col items-center justify-between bg-black/90 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Appel Nearby"
    >
      <div className="text-center mt-8">
        <p className="text-xl font-bold" style={{ color: COLORS.ivory }}>
          {call.deviceName || "Appareil proche"}
        </p>
        <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>
          {statusLabel}
        </p>
      </div>

      <div className="relative w-full max-w-md flex-1 my-4 flex items-center justify-center">
        {isVideo && isActive ? (
          <>
            <img
              ref={remoteImageRef}
              alt=""
              className="w-full max-h-[60vh] object-contain rounded-2xl bg-black"
            />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute bottom-2 right-2 w-24 rounded-xl border bg-black object-cover"
              style={{ borderColor: COLORS.borderTeal, transform: "scaleX(-1)" }}
            />
          </>
        ) : (
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{ background: COLORS.tealGlow || "rgba(45,191,166,0.2)", color: COLORS.teal }}
          >
            {isVideo ? <Video size={48} /> : <Phone size={48} />}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 mb-8">
        {call.state === "ringing_in" ? (
          <>
            <button
              type="button"
              onClick={handleDecline}
              className={buttonBase}
              style={{ background: "#ef4444", color: "#fff" }}
              aria-label="Refuser l’appel"
            >
              <PhoneOff size={24} />
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className={buttonBase}
              style={{ background: COLORS.teal, color: COLORS.bg }}
              aria-label="Répondre à l’appel"
            >
              <Phone size={24} />
            </button>
          </>
        ) : (
          <>
            {isActive && (
              <>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={buttonBase}
                  style={{ background: muted ? COLORS.gold : "rgba(255,255,255,0.12)", color: muted ? COLORS.bg : COLORS.ivory }}
                  aria-label={muted ? "Réactiver le micro" : "Couper le micro"}
                  aria-pressed={muted}
                >
                  {muted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSpeaker}
                  className={buttonBase}
                  style={{ background: speaker ? COLORS.teal : "rgba(255,255,255,0.12)", color: speaker ? COLORS.bg : COLORS.ivory }}
                  aria-label={speaker ? "Désactiver le haut-parleur" : "Activer le haut-parleur"}
                  aria-pressed={speaker}
                >
                  {speaker ? <Volume2 size={24} /> : <VolumeX size={24} />}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleEnd}
              className={buttonBase}
              style={{ background: "#ef4444", color: "#fff" }}
              aria-label="Raccrocher"
            >
              <PhoneOff size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default NearbyCallLayer;
