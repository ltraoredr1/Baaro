/**
 * BAARO ChatCallModal — écran d'appel type téléphone (VERSION CORRIGÉE)
 *
 * Corrections :
 * - acceptIncoming : la mise à jour de la table `calls` ne bloque plus l'appel
 *   (avant, un échec fermait l'appel dès qu'on décrochait)
 * - acceptIncoming : l'erreur réelle de connexion Daily s'affiche dans une alerte
 * - attachTracks : ne recrée plus les flux à chaque appel (son stable)
 * - pistes audio/vidéo rattrapées dès que l'appel devient actif
 * - endCall protégé contre les doubles appels (left-meeting + bouton)
 *
 * - Sonnerie entrante (boucle + vibration)
 * - Ton d'attente sortant (ringback)
 * - UI plein écran, avatar, boutons décrocher / raccrocher
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
import { COLORS as THEME_COLORS } from "../theme.js";
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
} from "../lib/callRingtone.js";

const baaroLogo = "/brand/baaro-logo.png";

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
          // Évite le son en double : l'élément <video> joue déjà l'audio
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
      onClose?.();
    },
    [callRecord?.id, cleanupMedia, onClose, stopAllSounds]
  );

  // ── Sonnerie selon le mode ────────────────────────────────────────────────
  useEffect(() => {
    if (status === "incoming") {
      startIncomingRingtone();
    } else if (status === "outgoing") {
      startOutgoingRingback();
    } else {
      stopRingtone();
    }
    return () => {
      stopRingtone();
    };
  }, [status]);

  // ── Appel sortant : rejoindre la room Daily ───────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
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
            onAccepted?.();
          },
          onParticipantLeft: () => endCall("ended"),
          onTrackStarted: () => attachTracks(),
          onLeft: () => endCall("ended"),
        });
        setTimeout(attachTracks, 500);
      } catch (e) {
        console.error(e);
        stopAllSounds();
        alert(
          "Connexion à l'appel impossible : " +
            (e?.errorMsg || e?.message || JSON.stringify(e))
        );
        if (mountedRef.current) onClose?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    roomUrl,
    token,
    callType,
    callRecord?.id,
    attachTracks,
    endCall,
    onAccepted,
    onClose,
    stopAllSounds,
  ]);

  // Appel actif : rattraper les pistes déjà présentes et surveiller les changements
  useEffect(() => {
    if (status !== "active") return;
    attachTracks();
    const t = setInterval(attachTracks, 1500);
    return () => clearInterval(t);
  }, [status, attachTracks]);

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

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopRingtone();
      clearInterval(timerRef.current);
      cleanupMedia();
      leaveCall().catch(() => {});
    };
  }, [cleanupMedia]);

  // ── Appel entrant : décrocher ─────────────────────────────────────────────
  const acceptIncoming = async () => {
    if (!roomUrl || !token) return;
    stopAllSounds();

    // 1. Rejoindre la salle Daily (seule étape qui peut vraiment faire échouer l'appel)
    try {
      await joinCall({ roomUrl, token, video: callType === "video" });
    } catch (e) {
      console.error(e);
      alert(
        "Connexion à l'appel impossible : " +
          (e?.errorMsg || e?.message || JSON.stringify(e))
      );
      onClose?.();
      return;
    }

    // 2. Passer en mode actif et écouter les événements
    setStatus("active");
    startedAtRef.current = Date.now();
    unsubscribeRef.current = subscribeCallEvents({
      onParticipantLeft: () => endCall("ended"),
      onTrackStarted: () => attachTracks(),
      onLeft: () => endCall("ended"),
    });
    setTimeout(attachTracks, 400);

    // 3. Mise à jour de la table calls : jamais bloquante
    if (callRecord?.id) {
      updateCallStatus(callRecord.id, {
        status: "accepted",
        started_at: new Date().toISOString(),
      }).catch((e) => console.warn("updateCallStatus :", e));
    }
    onAccepted?.();
  };

  const rejectIncoming = async () => {
    stopAllSounds();
    if (callRecord?.id) {
      await updateCallStatus(callRecord.id, {
        status: "rejected",
        ended_at: new Date().toISOString(),
      }).catch(() => {});
    }
    onRejected?.();
    onClose?.();
  };

  const toggleMic = async () => {
    try {
      await enableMic(!micOn);
      setMicOn((v) => !v);
    } catch {}
  };

  const toggleCam = async () => {
    try {
      await enableCamera(!camOn);
      setCamOn((v) => !v);
    } catch {}
  };

  // Haut-parleur / écouteur : possible seulement si le navigateur expose
  // les sorties audio (setSinkId). Sinon, un message explique la limite.
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
    ].filter(Boolean);
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
        {/* Vidéo distante (plein écran en appel vidéo actif) */}
        {callType === "video" && status === "active" && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Overlay sombre si vidéo active pour lisibilité */}
        {callType === "video" && status === "active" && (
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />
        )}

        {/* Contenu centré (avatar + nom) — visible surtout hors vidéo active */}
        <div
          className={`relative z-10 flex flex-col items-center text-center transition-opacity ${
            callType === "video" && status === "active" ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          {/* Anneaux de sonnerie animés */}
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
            className={`relative w-28 h-28 rounded-full overflow-hidden ring-4 shadow-2xl ${
              isRinging ? "animate-pulse" : ""
            }`}
            style={{
              ringColor: status === "incoming" ? "#22C55E" : C.gold,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            {otherUser.avatar ? (
              <img
                src={otherUser.avatar}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = baaroLogo;
                }}
              />
            ) : (
              <img src={baaroLogo} alt="" className="w-full h-full object-cover" />
            )}
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

        {/* Mini vidéo locale (coin bas-droit) en appel vidéo actif */}
        {callType === "video" && status === "active" && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute bottom-28 right-4 w-28 h-40 rounded-2xl object-cover border-2 z-20 shadow-xl"
            style={{ borderColor: C.gold }}
          />
        )}
      </div>

      {/* Barre de contrôles */}
      <div
        className="relative z-20 px-6 pb-10 pt-4"
        style={{
          paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))",
          background:
            callType === "video" && status === "active"
              ? "linear-gradient(transparent, rgba(0,0,0,0.75))"
              : "transparent",
        }}
      >
        {/* Durée en mode vidéo actif */}
        {callType === "video" && status === "active" && (
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
              {/* Refuser */}
              <button
                type="button"
                onClick={rejectIncoming}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
                style={{ background: "#EF4444", color: "#fff" }}
                aria-label="Refuser"
              >
                <PhoneOff size={28} />
              </button>
              {/* Accepter */}
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
              {/* Micro */}
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

              {/* Haut-parleur */}
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

              {/* Caméra (vidéo seulement) */}
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

              {/* Raccrocher */}
              <button
                type="button"
                onClick={() => endCall("ended")}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
                style={{ background: "#EF4444", color: "#fff" }}
                aria-label="Raccrocher"
              >
                <PhoneOff size={28} />
              </button>
            </>
          )}
        </div>

        {/* Bouton fermer discret (sortant / actif) */}
        {status !== "incoming" && (
          <button
            type="button"
            onClick={() => endCall("ended")}
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
