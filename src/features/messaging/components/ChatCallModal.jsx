/**
 * BAARO ChatCallModal — écran d'appel type téléphone (v3)
 *
 * Corrections par rapport à la version précédente :
 * - Les callbacks parent (onClose, onAccepted, onRejected) passent par des refs :
 *   avant, un parent qui recréait ces fonctions à chaque rendu relançait l'effet
 *   « appel sortant » et rejoignait la salle Daily plusieurs fois.
 * - mountedRef est remis à true au montage (React StrictMode le laissait à false
 *   pour les appels entrants → plus aucune mise à jour d'état).
 * - L'anneau de l'avatar utilisait `ringColor` (propriété CSS inexistante) :
 *   remplacé par un box-shadow.
 * - L'alerte d'erreur ne s'affiche plus si le composant est déjà démonté.
 * - Timeout de sécurité : un appel sans réponse est clôturé en « missed ».
 *
 * Nouveautés :
 * - Vibration réelle pendant la sonnerie entrante (si supportée)
 * - Sans réponse après 45 s (sortant et entrant) → statut « missed »
 * - Écran maintenu allumé pendant l'appel (Wake Lock)
 * - Indicateur de micro coupé de l'interlocuteur n'est pas ajouté (dépend de lib/chatCalls)
 * - Prévisualisation caméra locale pendant la sonnerie d'un appel vidéo sortant
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { COLORS as THEME_COLORS } from "../../../theme.js";
import {
  startCall,
  joinCall,
  leaveCall,
  enableMic,
  enableCamera,
  subscribeCallEvents,
  getParticipants,
  updateCallStatus,
  listAudioOutputs,
  canSelectAudioOutput,
} from "../lib/chatCalls.js";
import {
  startIncomingRingtone,
  startOutgoingRingback,
  stopRingtone,
} from "../../../lib/callRingtone.js";

const baaroLogo = "/brand/baaro-logo.png";

const NO_ANSWER_TIMEOUT_MS = 45000;

const FALLBACK = {
  surface: "#12141F",
  surface2: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.1)",
  borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.55)",
  gold: "#D9AE52",
  bg: "#0B1220",
  teal: "#2DBFA6",
};

/** Sortie audio choisie par l'utilisateur (null = sortie par défaut du téléphone) */
let outputSinkId = null;

/** Associe un flux à un élément média seulement si les pistes ont changé */
function setStream(el, tracks) {
  if (!el || !tracks.length) return;
  const ids = tracks.map((t) => t.id).join(",");
  if (el.dataset.trackIds === ids) return;
  el.dataset.trackIds = ids;
  el.srcObject = new MediaStream(tracks);
  if (outputSinkId && !el.muted && typeof el.setSinkId === "function") {
    el.setSinkId(outputSinkId).catch(() => {});
  }
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
}

export function ChatCallModal({
  mode = "outgoing",
  callType = "voice",
  callRecord,
  roomUrl,
  token,
  otherUser = {},
  onClose,
  onAccepted,
  onRejected,
}) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const [status, setStatus] = useState(mode); // outgoing | incoming | active | ended
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(callType === "video");
  const [duration, setDuration] = useState(0);
  const [speakerOn, setSpeakerOn] = useState(true);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const mountedRef = useRef(true);
  const unsubscribeRef = useRef(null);
  const endedRef = useRef(false);
  const wakeLockRef = useRef(null);

  // Callbacks parent stockés en refs → dépendances d'effets stables
  const onCloseRef = useRef(onClose);
  const onAcceptedRef = useRef(onAccepted);
  const onRejectedRef = useRef(onRejected);
  useEffect(() => {
    onCloseRef.current = onClose;
    onAcceptedRef.current = onAccepted;
    onRejectedRef.current = onRejected;
  });

  const cleanupMedia = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    const el = document.getElementById("baaro-call-remote-audio");
    if (el) {
      try {
        el.srcObject?.getTracks()?.forEach((t) => t.stop());
      } catch {}
      el.srcObject = null;
      el.remove();
    }
    [localVideoRef, remoteVideoRef].forEach((r) => {
      if (r.current) {
        try {
          r.current.srcObject?.getTracks()?.forEach((t) => t.stop());
        } catch {}
        r.current.srcObject = null;
        delete r.current.dataset.trackIds;
      }
    });
    if (unsubscribeRef.current) {
      try {
        unsubscribeRef.current();
      } catch {}
      unsubscribeRef.current = null;
    }
  }, []);

  const stopAllSounds = useCallback(() => {
    stopRingtone();
    try {
      navigator.vibrate?.(0);
    } catch {}
  }, []);

  const attachTracks = useCallback(() => {
    try {
      const parts = getParticipants() || {};
      Object.values(parts).forEach((participant) => {
        const tracks = participant.tracks || {};
        const videoTrack = tracks.video?.persistentTrack || tracks.video?.track;
        const audioTrack = tracks.audio?.persistentTrack || tracks.audio?.track;

        if (participant.local) {
          if (videoTrack && localVideoRef.current) {
            localVideoRef.current.muted = true;
            localVideoRef.current.playsInline = true;
            setStream(localVideoRef.current, [videoTrack]);
          }
          return;
        }

        // Vidéo distante : l'élément <video> porte aussi le son
        if (videoTrack && remoteVideoRef.current) {
          const stale = document.getElementById("baaro-call-remote-audio");
          if (stale) {
            stale.srcObject = null;
            stale.remove();
          }
          setStream(
            remoteVideoRef.current,
            [videoTrack, audioTrack].filter(Boolean)
          );
          return;
        }

        // Audio distant seul (appel vocal, ou caméra distante coupée)
        if (audioTrack) {
          let audio = document.getElementById("baaro-call-remote-audio");
          if (!audio) {
            audio = document.createElement("audio");
            audio.id = "baaro-call-remote-audio";
            audio.autoplay = true;
            audio.playsInline = true;
            audio.setAttribute("playsinline", "");
            audio.style.display = "none";
            document.body.appendChild(audio);
          }
          setStream(audio, [audioTrack]);
        }
      });
    } catch (error) {
      console.error("Erreur d'attachement des pistes d'appel :", error);
    }
  }, []);

  const endCall = useCallback(
    async (finalStatus = "ended") => {
      if (endedRef.current) return;
      endedRef.current = true;
      stopAllSounds();
      clearInterval(timerRef.current);
      const dur = startedAtRef.current
        ? Math.floor((Date.now() - startedAtRef.current) / 1000)
        : 0;
      try {
        await leaveCall();
      } catch {}
      if (callRecord?.id) {
        updateCallStatus(callRecord.id, {
          status: finalStatus,
          ended_at: new Date().toISOString(),
          duration_seconds: dur,
        }).catch(() => {});
      }
      cleanupMedia();
      if (mountedRef.current) setStatus("ended");
      onCloseRef.current?.();
    },
    [callRecord?.id, cleanupMedia, stopAllSounds]
  );

  // ── Sonnerie + vibration selon le mode ────────────────────────────────────
  useEffect(() => {
    let vibrateTimer = null;
    if (status === "incoming") {
      startIncomingRingtone();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        const buzz = () => navigator.vibrate([500, 300, 500]);
        buzz();
        vibrateTimer = setInterval(buzz, 2000);
      }
    } else if (status === "outgoing") {
      startOutgoingRingback();
    } else {
      stopRingtone();
    }
    return () => {
      clearInterval(vibrateTimer);
      try {
        navigator.vibrate?.(0);
      } catch {}
      stopRingtone();
    };
  }, [status]);

  // ── Sans réponse : clôture automatique ────────────────────────────────────
  useEffect(() => {
    if (status !== "outgoing" && status !== "incoming") return;
    const t = setTimeout(() => {
      if (status === "incoming") {
        stopAllSounds();
        if (callRecord?.id) {
          updateCallStatus(callRecord.id, {
            status: "missed",
            ended_at: new Date().toISOString(),
          }).catch(() => {});
        }
        endedRef.current = true;
        onRejectedRef.current?.();
        onCloseRef.current?.();
      } else {
        endCall("missed");
      }
    }, NO_ANSWER_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, callRecord?.id, endCall, stopAllSounds]);

  // ── Écran allumé pendant l'appel ──────────────────────────────────────────
  useEffect(() => {
    if (status === "ended") return;
    let cancelled = false;
    (async () => {
      try {
        if (navigator.wakeLock?.request) {
          const lock = await navigator.wakeLock.request("screen");
          if (cancelled) {
            lock.release().catch(() => {});
          } else {
            wakeLockRef.current = lock;
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [status === "ended"]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Appel sortant : rejoindre la room Daily (une seule fois) ──────────────
  useEffect(() => {
    if (mode !== "outgoing" || !roomUrl || !token) return;
    let cancelled = false;
    (async () => {
      try {
        await startCall({ roomUrl, token, video: callType === "video" });
        if (cancelled || !mountedRef.current) return;
        unsubscribeRef.current = subscribeCallEvents({
          onParticipantJoined: () => {
            if (!mountedRef.current) return;
            stopAllSounds();
            setStatus("active");
            startedAtRef.current = Date.now();
            if (callRecord?.id) {
              updateCallStatus(callRecord.id, {
                status: "accepted",
                started_at: new Date().toISOString(),
              }).catch(() => {});
            }
            onAcceptedRef.current?.();
          },
          onParticipantLeft: () => endCall("ended"),
          onTrackStarted: () => attachTracks(),
          onLeft: () => endCall("ended"),
        });
        setTimeout(attachTracks, 500);
      } catch (e) {
        console.error(e);
        stopAllSounds();
        if (!cancelled && mountedRef.current) {
          alert(
            "Connexion à l'appel impossible : " +
              (e?.errorMsg || e?.message || JSON.stringify(e))
          );
          onCloseRef.current?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, roomUrl, token, callType, callRecord?.id, attachTracks, endCall, stopAllSounds]);

  // Appel actif : rattraper les pistes déjà présentes et surveiller les changements
  useEffect(() => {
    if (status !== "active" && !(status === "outgoing" && callType === "video")) return;
    attachTracks();
    const t = setInterval(attachTracks, 1500);
    return () => clearInterval(t);
  }, [status, callType, attachTracks]);

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

  // Montage / démontage
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAllSounds();
      clearInterval(timerRef.current);
      cleanupMedia();
      leaveCall().catch(() => {});
    };
  }, [cleanupMedia, stopAllSounds]);

  // ── Appel entrant : décrocher ─────────────────────────────────────────────
  const acceptIncoming = async () => {
    if (!roomUrl || !token) return;
    stopAllSounds();

    try {
      await joinCall({ roomUrl, token, video: callType === "video" });
    } catch (e) {
      console.error(e);
      alert(
        "Connexion à l'appel impossible : " +
          (e?.errorMsg || e?.message || JSON.stringify(e))
      );
      onCloseRef.current?.();
      return;
    }

    if (!mountedRef.current) return;
    setStatus("active");
    startedAtRef.current = Date.now();
    unsubscribeRef.current = subscribeCallEvents({
      onParticipantLeft: () => endCall("ended"),
      onTrackStarted: () => attachTracks(),
      onLeft: () => endCall("ended"),
    });
    setTimeout(attachTracks, 400);

    if (callRecord?.id) {
      updateCallStatus(callRecord.id, {
        status: "accepted",
        started_at: new Date().toISOString(),
      }).catch((e) => console.warn("updateCallStatus :", e));
    }
    onAcceptedRef.current?.();
  };

  const rejectIncoming = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopAllSounds();
    if (callRecord?.id) {
      await updateCallStatus(callRecord.id, {
        status: "rejected",
        ended_at: new Date().toISOString(),
      }).catch(() => {});
    }
    onRejectedRef.current?.();
    onCloseRef.current?.();
  };

  const toggleMic = async () => {
    try {
      await enableMic(!micOn);
      setMicOn((v) => !v);
    } catch (e) {
      console.warn("Micro :", e);
    }
  };

  const toggleCam = async () => {
    try {
      await enableCamera(!camOn);
      setCamOn((v) => !v);
    } catch (e) {
      console.warn("Caméra :", e);
    }
  };

  // Haut-parleur / écouteur : possible seulement si le navigateur expose setSinkId
  const toggleSpeaker = async () => {
    const next = !speakerOn;
    const outputs = canSelectAudioOutput() ? await listAudioOutputs() : [];
    const isEarpiece = (d) => /earpiece|receiver|handset|écouteur|ecouteur/i.test(d.label);
    const isSpeaker = (d) => /speaker|haut-parleur|loud/i.test(d.label);
    const target = next
      ? outputs.find(isSpeaker) || outputs.find((d) => !isEarpiece(d))
      : outputs.find(isEarpiece);

    if (!target) {
      alert(
        "Ce navigateur ne permet pas de changer la sortie audio. " +
          "Utilise les boutons de volume ou un casque. " +
          "Le choix haut-parleur / écouteur sera disponible dans l'application Android."
      );
      return;
    }

    const elements = [
      remoteVideoRef.current,
      document.getElementById("baaro-call-remote-audio"),
    ].filter((el) => el && typeof el.setSinkId === "function");
    try {
      await Promise.all(elements.map((el) => el.setSinkId(target.deviceId)));
      outputSinkId = target.deviceId;
      setSpeakerOn(next);
    } catch (e) {
      alert("Changement de sortie audio impossible : " + (e?.message || e));
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  const statusLabel =
    status === "outgoing"
      ? "Appel en cours…"
      : status === "incoming"
        ? callType === "video"
          ? "Appel vidéo entrant"
          : "Appel vocal entrant"
        : status === "active"
          ? formatTime(duration)
          : "Terminé";

  const isRinging = status === "incoming" || status === "outgoing";
  const videoActive = callType === "video" && status === "active";
  const ringColor = status === "incoming" ? "#22C55E" : C.gold;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse at 50% 20%, #1a2338 0%, #0B1220 55%, #070b14 100%)",
      }}
    >
      {/* Zone principale */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8 relative">
        {videoActive && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {videoActive && (
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />
        )}

        <div
          className={`relative z-10 flex flex-col items-center text-center transition-opacity ${
            videoActive ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          {isRinging && (
            <>
              <div
                className="absolute w-40 h-40 rounded-full animate-ping"
                style={{
                  background: "rgba(217,174,82,0.12)",
                  animationDuration: "1.8s",
                }}
              />
              <div
                className="absolute w-52 h-52 rounded-full animate-ping"
                style={{
                  background: "rgba(217,174,82,0.07)",
                  animationDuration: "2.2s",
                  animationDelay: "0.3s",
                }}
              />
            </>
          )}

          {/* Avatar */}
          <div
            className={`relative w-28 h-28 rounded-full overflow-hidden shadow-2xl ${
              isRinging ? "animate-pulse" : ""
            }`}
            style={{
              boxShadow: `0 0 0 4px ${ringColor}, 0 20px 40px rgba(0,0,0,0.4)`,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            <img
              src={otherUser.avatar || baaroLogo}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                if (e.target.src.endsWith(baaroLogo)) return;
                e.target.src = baaroLogo;
              }}
            />
          </div>

          <h2
            className="mt-6 text-2xl font-bold tracking-tight"
            style={{ color: C.ivory }}
          >
            {otherUser.name || "Membre"}
          </h2>

          <p
            className={`mt-2 text-sm font-medium ${isRinging ? "animate-pulse" : ""}`}
            style={{
              color:
                status === "incoming"
                  ? "#22C55E"
                  : status === "outgoing"
                    ? C.gold
                    : C.muted,
            }}
          >
            {statusLabel}
          </p>

          {status === "outgoing" && (
            <p className="mt-1 text-xs" style={{ color: C.muted }}>
              Sonnerie chez le correspondant…
            </p>
          )}
          {status === "incoming" && (
            <p className="mt-1 text-xs" style={{ color: C.muted }}>
              {callType === "video" ? "Vidéo" : "Vocal"} · BAARO sécurisé
            </p>
          )}
        </div>

        {/* Mini vidéo locale : pendant la sonnerie sortante et en appel actif */}
        {callType === "video" && (status === "active" || status === "outgoing") && camOn && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-28 right-4 w-28 h-40 rounded-2xl object-cover border-2 z-20 shadow-xl"
            style={{ borderColor: C.gold, transform: "scaleX(-1)" }}
          />
        )}
      </div>

      {/* Barre de contrôles */}
      <div
        className="relative z-20 px-6 pb-10 pt-4"
        style={{
          paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))",
          background: videoActive
            ? "linear-gradient(transparent, rgba(0,0,0,0.75))"
            : "transparent",
        }}
      >
        {videoActive && (
          <p
            className="text-center text-sm font-semibold mb-4 tabular-nums"
            style={{ color: C.ivory }}
          >
            {formatTime(duration)}
          </p>
        )}

        <div className="flex items-center justify-center gap-5">
          {status === "incoming" ? (
            <>
              <button
                type="button"
                onClick={rejectIncoming}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
                style={{ background: "#EF4444", color: "#fff" }}
                aria-label="Refuser"
              >
                <PhoneOff size={28} />
              </button>
              <button
                type="button"
                onClick={acceptIncoming}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition animate-pulse"
                style={{ background: "#22C55E", color: "#fff" }}
                aria-label="Accepter"
              >
                {callType === "video" ? <Video size={28} /> : <Phone size={28} />}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMic}
                className="w-14 h-14 rounded-full flex items-center justify-center border active:scale-95 transition"
                style={{
                  background: micOn ? "rgba(255,255,255,0.12)" : "rgba(239,68,68,0.35)",
                  borderColor: "rgba(255,255,255,0.15)",
                  color: micOn ? C.ivory : "#EF4444",
                }}
                aria-label={micOn ? "Couper le micro" : "Activer le micro"}
              >
                {micOn ? <Mic size={22} /> : <MicOff size={22} />}
              </button>

              <button
                type="button"
                onClick={toggleSpeaker}
                className="w-14 h-14 rounded-full flex items-center justify-center border active:scale-95 transition"
                style={{
                  background: speakerOn ? "rgba(217,174,82,0.25)" : "rgba(255,255,255,0.12)",
                  borderColor: "rgba(255,255,255,0.15)",
                  color: speakerOn ? C.gold : C.ivory,
                }}
                aria-label={speakerOn ? "Passer sur l'écouteur" : "Activer le haut-parleur"}
              >
                {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
              </button>

              {callType === "video" && (
                <button
                  type="button"
                  onClick={toggleCam}
                  className="w-14 h-14 rounded-full flex items-center justify-center border active:scale-95 transition"
                  style={{
                    background: camOn ? "rgba(255,255,255,0.12)" : "rgba(239,68,68,0.35)",
                    borderColor: "rgba(255,255,255,0.15)",
                    color: camOn ? C.ivory : "#EF4444",
                  }}
                  aria-label={camOn ? "Couper la caméra" : "Activer la caméra"}
                >
                  {camOn ? <Video size={22} /> : <VideoOff size={22} />}
                </button>
              )}

              <button
                type="button"
                onClick={() => endCall(status === "outgoing" ? "cancelled" : "ended")}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
                style={{ background: "#EF4444", color: "#fff" }}
                aria-label="Raccrocher"
              >
                <PhoneOff size={28} />
              </button>
            </>
          )}
        </div>

        {status !== "incoming" && (
          <button
            type="button"
            onClick={() => endCall(status === "outgoing" ? "cancelled" : "ended")}
            className="absolute top-0 right-4 p-2 rounded-full opacity-50 hover:opacity-100 transition"
            style={{ color: C.muted }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
