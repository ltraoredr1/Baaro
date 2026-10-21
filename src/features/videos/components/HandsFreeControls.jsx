import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  Mic, MicOff, Camera, CameraOff, Sparkles,
} from "lucide-react";

const VISION_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const ACTION_COOLDOWN_MS = 1400;
const DETECTION_INTERVAL_MS = 180;
const NATIVE_SILENCE_MS = 900;

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// Message d'erreur lisible selon la cause réelle.
function describeCameraError(err, stage) {
  const name = err?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Accès à la caméra refusé. Autorisez la caméra dans les réglages de l'application.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Aucune caméra disponible sur cet appareil.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "La caméra est déjà utilisée par une autre application.";
  }
  if (stage === "models") {
    return "Impossible de charger les modèles de détection. Vérifiez la connexion internet.";
  }
  if (stage === "camera") {
    return "Impossible de démarrer la caméra.";
  }
  return err?.message || "Impossible d'activer les gestes.";
}

// Crée un modèle MediaPipe : GPU puis CPU sur le web, CPU seul en application native.
async function createModel(ModelClass, vision, modelPath, extra) {
  const delegates = isNative() ? ["CPU"] : ["GPU", "CPU"];
  let lastError = null;

  for (const delegate of delegates) {
    try {
      return await ModelClass.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate },
        runningMode: "VIDEO",
        ...extra,
      });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export default function HandsFreeControls({
  activeVideoId,
  isPlaying,
  isMuted,
  onNext,
  onPrevious,
  onLike,
  onTogglePlayback,
  onPause,
  onResume,
  onToggleMute,
  onMute,
  onUnmute,
  onOpenComments,
  onToggleFullscreen,
}) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [status, setStatus] = useState("Mode mains libres désactivé");
  const [error, setError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const handModelRef = useRef(null);
  const faceModelRef = useRef(null);
  const rafRef = useRef(null);
  const lastActionAtRef = useRef(0);
  const lastTranscriptRef = useRef({ text: "", at: 0 });
  const previousHandXRef = useRef(null);
  const previousNoseRef = useRef(null);
  const voiceEnabledRef = useRef(false);
  const cameraEnabledRef = useRef(false);

  const actionsRef = useRef({});
  actionsRef.current = {
    activeVideoId, isPlaying, isMuted, onNext, onPrevious, onLike,
    onTogglePlayback, onPause, onResume, onToggleMute, onMute, onUnmute,
    onOpenComments, onToggleFullscreen,
  };

  const runAction = useCallback((action, label, { force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastActionAtRef.current < ACTION_COOLDOWN_MS) return false;

    const a = actionsRef.current;
    const id = a.activeVideoId;
    lastActionAtRef.current = now;
    setStatus(label);

    switch (action) {
      case "next": a.onNext?.(); break;
      case "previous": a.onPrevious?.(); break;
      case "like": if (id != null) a.onLike?.(id); break;
      case "toggle-play": a.onTogglePlayback?.(); break;
      case "pause":
        if (a.onPause) a.onPause();
        else if (a.isPlaying) a.onTogglePlayback?.();
        break;
      case "resume":
        if (a.onResume) a.onResume();
        else if (!a.isPlaying) a.onTogglePlayback?.();
        break;
      case "mute":
        if (a.onMute) a.onMute();
        else if (a.isMuted === false) a.onToggleMute?.();
        break;
      case "unmute":
        if (a.onUnmute) a.onUnmute();
        else if (a.isMuted !== false) a.onToggleMute?.();
        break;
      case "comments": if (id != null) a.onOpenComments?.(id); break;
      case "fullscreen": if (id != null) a.onToggleFullscreen?.(id); break;
      default: return false;
    }
    return true;
  }, []);

  // Analyse d'une phrase (web et application native) avec anti-doublon.
  const handleTranscript = useCallback((raw) => {
    const command = normalize(raw);
    if (!command) return;

    const now = Date.now();
    if (
      command === lastTranscriptRef.current.text &&
      now - lastTranscriptRef.current.at < 2200
    ) return;
    lastTranscriptRef.current = { text: command, at: now };

    if (/\b(video suivante|suivante|video d'apres|passe a la suivante|suivant)\b/.test(command)) {
      runAction("next", "Commande : vidéo suivante");
    } else if (/\b(video precedente|precedente|retour en arriere)\b/.test(command)) {
      runAction("previous", "Commande : vidéo précédente");
    } else if (/\b(j'aime|jaime|like|aime cette video)\b/.test(command)) {
      runAction("like", "Commande : j'aime");
    } else if (/\b(pause|arrete la video|mettre en pause)\b/.test(command)) {
      runAction("pause", "Commande : pause");
    } else if (/\b(reprendre|reprends|continue la video|relance la video)\b/.test(command)) {
      runAction("resume", "Commande : reprise");
    } else if (/\b(couper le son|muet|desactiver le son)\b/.test(command)) {
      runAction("mute", "Commande : son coupé");
    } else if (/\b(activer le son|remettre le son)\b/.test(command)) {
      runAction("unmute", "Commande : son activé");
    } else if (/\b(commentaires|ouvrir les commentaires)\b/.test(command)) {
      runAction("comments", "Commande : commentaires");
    } else if (/\b(plein ecran|agrandir la video)\b/.test(command)) {
      runAction("fullscreen", "Commande : plein écran");
    }
  }, [runAction]);

  // Reconnaissance vocale : plugin natif dans l'application, API du navigateur sur le web.
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    if (!voiceEnabled) return undefined;

    // ---------- APPLICATION NATIVE (Capacitor) ----------
    if (isNative()) {
      let disposed = false;
      let silenceTimer = null;
      let latest = "";
      let restartTimer = null;

      const flush = () => {
        const text = latest;
        latest = "";
        if (text) handleTranscript(text);
      };

      const startListening = async () => {
        if (disposed || !voiceEnabledRef.current) return;
        try {
          await SpeechRecognition.start({
            language: "fr-FR",
            maxResults: 1,
            partialResults: true,
            popup: false,
          });
        } catch (err) {
          if (!disposed) {
            setError(`Reconnaissance vocale : ${err?.message || "démarrage impossible"}`);
            setVoiceEnabled(false);
          }
        }
      };

      const setup = async () => {
        try {
          const { available } = await SpeechRecognition.available();
          if (!available) {
            throw new Error("Reconnaissance vocale indisponible sur cet appareil.");
          }

          let permission = await SpeechRecognition.checkPermissions();
          if (permission.speechRecognition !== "granted") {
            permission = await SpeechRecognition.requestPermissions();
          }
          if (permission.speechRecognition !== "granted") {
            throw new Error("Autorisation du microphone refusée.");
          }

          await SpeechRecognition.removeAllListeners();

          await SpeechRecognition.addListener("partialResults", (data) => {
            latest = data?.matches?.[0] || data?.value?.[0] || "";
            clearTimeout(silenceTimer);
            // Silence détecté : on traite la phrase puis on relance une session propre.
            silenceTimer = setTimeout(async () => {
              flush();
              try { await SpeechRecognition.stop(); } catch { /* déjà arrêtée */ }
            }, NATIVE_SILENCE_MS);
          });

          await SpeechRecognition.addListener("listeningState", (data) => {
            if (data?.status === "stopped" && !disposed && voiceEnabledRef.current) {
              clearTimeout(silenceTimer);
              flush();
              clearTimeout(restartTimer);
              restartTimer = setTimeout(startListening, 350);
            }
          });

          if (disposed) return;
          setError("");
          setStatus("Écoute des commandes vocales");
          await startListening();
        } catch (err) {
          if (!disposed) {
            setError(err?.message || "Impossible de démarrer le microphone.");
            setVoiceEnabled(false);
          }
        }
      };

      setup();

      return () => {
        disposed = true;
        voiceEnabledRef.current = false;
        clearTimeout(silenceTimer);
        clearTimeout(restartTimer);
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      };
    }

    // ---------- NAVIGATEUR WEB ----------
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("La reconnaissance vocale n'est pas prise en charge par ce navigateur.");
      setVoiceEnabled(false);
      return undefined;
    }

    const recognition = new Recognition();
    let disposed = false;
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result?.isFinal) return;
      handleTranscript(result[0].transcript);
    };

    recognition.onerror = (event) => {
      if (!disposed && event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Reconnaissance vocale : ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (!disposed && voiceEnabledRef.current) {
        try { recognition.start(); } catch { /* déjà redémarrée */ }
      }
    };

    try {
      recognition.start();
      setError("");
      setStatus("Écoute des commandes vocales");
    } catch {
      setError("Impossible de démarrer le microphone.");
    }

    return () => {
      disposed = true;
      voiceEnabledRef.current = false;
      recognition.onend = null;
      recognition.onresult = null;
      try { recognition.stop(); } catch { /* déjà arrêtée */ }
    };
  }, [voiceEnabled, handleTranscript]);

  // Caméra et modèles : toutes les ressources sont libérées même en cas d'échec.
  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
    if (!cameraEnabled) return undefined;

    let cancelled = false;
    let localStream = null;
    let localHandModel = null;
    let localFaceModel = null;
    let localRaf = null;
    let lastDetectionAt = 0;
    let stage = "camera";

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Caméra indisponible dans ce navigateur.");
        }
        setError("");
        setStatus("Initialisation de la détection des gestes");

        // Résolution réduite : moins de données traitées, moins de batterie.
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15, max: 20 },
          },
        });
        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = localStream;
        const video = videoRef.current;
        if (!video) throw new Error("Élément vidéo de la caméra introuvable.");
        video.muted = true;
        video.setAttribute("playsinline", "true");
        video.srcObject = localStream;
        await video.play();

        stage = "models";
        setStatus("Chargement des modèles de détection");
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM);
        if (cancelled) return;

        localHandModel = await createModel(HandLandmarker, vision, HAND_MODEL, { numHands: 1 });
        handModelRef.current = localHandModel;
        if (cancelled) {
          localHandModel.close();
          localHandModel = null;
          handModelRef.current = null;
          return;
        }

        // Le visage est facultatif : sans lui, les gestes de la main restent actifs.
        try {
          localFaceModel = await createModel(FaceLandmarker, vision, FACE_MODEL, { numFaces: 1 });
          faceModelRef.current = localFaceModel;
        } catch (faceErr) {
          console.warn("BAARO hands-free : mouvements de tête indisponibles", faceErr);
          localFaceModel = null;
        }
        if (cancelled) {
          try { localHandModel?.close(); } catch { /* best effort */ }
          try { localFaceModel?.close(); } catch { /* best effort */ }
          localHandModel = null;
          localFaceModel = null;
          handModelRef.current = null;
          faceModelRef.current = null;
          return;
        }

        setStatus(
          localFaceModel
            ? "Caméra active — gestes disponibles"
            : "Caméra active — gestes de la main uniquement"
        );

        const detect = (timestamp) => {
          if (cancelled) return;
          localRaf = requestAnimationFrame(detect);
          rafRef.current = localRaf;
          if (timestamp - lastDetectionAt < DETECTION_INTERVAL_MS) return;
          lastDetectionAt = timestamp;

          // Aucune analyse quand l'application est en arrière-plan.
          if (document.hidden) return;

          const currentVideo = videoRef.current;
          if (!currentVideo || currentVideo.readyState < 2) return;

          try {
            const handResult = localHandModel.detectForVideo(currentVideo, timestamp);
            const faceResult = localFaceModel
              ? localFaceModel.detectForVideo(currentVideo, timestamp)
              : null;
            const canTrigger = Date.now() - lastActionAtRef.current >= ACTION_COOLDOWN_MS;
            const hand = handResult.landmarks?.[0];

            if (hand && canTrigger) {
              const wrist = hand[0];
              const thumbTip = hand[4];
              const thumbJoint = hand[3];
              const tips = [8, 12, 16, 20];
              const joints = [6, 10, 14, 18];
              const fingersOpen = tips.map((tip, i) => hand[tip].y < hand[joints[i]].y);
              const openPalm = fingersOpen.every(Boolean);
              const thumbUp = thumbTip.y < thumbJoint.y &&
                !fingersOpen[0] && !fingersOpen[1] && !openPalm;

              if (thumbUp) {
                runAction("like", "Geste : j'aime");
              } else if (openPalm) {
                runAction("toggle-play", "Geste : pause / reprise");
              } else if (previousHandXRef.current != null) {
                const dx = wrist.x - previousHandXRef.current;
                if (Math.abs(dx) > 0.22) {
                  runAction(dx < 0 ? "next" : "previous",
                    dx < 0 ? "Geste : vidéo suivante" : "Geste : vidéo précédente");
                }
              }
              previousHandXRef.current = wrist.x;
            } else if (!hand) {
              previousHandXRef.current = null;
            }

            const face = faceResult?.faceLandmarks?.[0];
            if (face && canTrigger) {
              const nose = face[1];
              if (previousNoseRef.current) {
                const dx = nose.x - previousNoseRef.current.x;
                const dy = nose.y - previousNoseRef.current.y;
                if (Math.abs(dx) > 0.12) {
                  runAction(dx < 0 ? "next" : "previous",
                    dx < 0 ? "Tête : vidéo suivante" : "Tête : vidéo précédente");
                } else if (Math.abs(dy) > 0.14) {
                  runAction("toggle-play", "Tête : pause / reprise");
                }
              }
              previousNoseRef.current = { x: nose.x, y: nose.y };
            } else if (!face) {
              previousNoseRef.current = null;
            }
          } catch (err) {
            console.debug("BAARO hands-free vision:", err);
          }
        };
        localRaf = requestAnimationFrame(detect);
        rafRef.current = localRaf;
      } catch (err) {
        console.error("BAARO hands-free caméra:", err);
        if (!cancelled) {
          setError(describeCameraError(err, stage));
          setCameraEnabled(false);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      cameraEnabledRef.current = false;
      if (localRaf != null) cancelAnimationFrame(localRaf);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      try { localHandModel?.close(); } catch { /* libération best effort */ }
      try { localFaceModel?.close(); } catch { /* libération best effort */ }
      if (handModelRef.current === localHandModel) handModelRef.current = null;
      if (faceModelRef.current === localFaceModel) faceModelRef.current = null;
      localStream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === localStream) streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      previousHandXRef.current = null;
      previousNoseRef.current = null;
    };
  }, [cameraEnabled, runAction]);

  return (
    <section className="fixed bottom-24 left-3 z-[60] w-[min(290px,calc(100vw-24px))] rounded-2xl border border-white/15 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
      {/* Hors écran plutôt que display:none, sinon certains WebView refusent de lire le flux. */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        style={{
          position: "fixed",
          width: 2,
          height: 2,
          opacity: 0,
          pointerEvents: "none",
          left: 0,
          top: 0,
        }}
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-400 text-black">
          <Sparkles size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">BAARO mains libres</p>
          <p className="truncate text-[11px] text-white/60">{status}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setError(""); setVoiceEnabled((v) => !v); }}
          className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold ${voiceEnabled ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
          {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          {voiceEnabled ? "Voix active" : "Activer la voix"}
        </button>
        <button type="button" onClick={() => { setError(""); setCameraEnabled((v) => !v); }}
          className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold ${cameraEnabled ? "bg-yellow-400 text-black" : "bg-white/10 text-white"}`}>
          {cameraEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
          {cameraEnabled ? "Gestes actifs" : "Activer les gestes"}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-2 text-xs text-red-200">{error}</p>}

      <p className="mt-3 text-[10px] leading-relaxed text-white/50">
        Voix : « vidéo suivante », « précédente », « j'aime », « pause », « reprendre »,
        « couper le son », « activer le son », « commentaires », « plein écran ».
        La caméra s'arrête lorsque les gestes sont désactivés.
      </p>
    </section>
  );
}
