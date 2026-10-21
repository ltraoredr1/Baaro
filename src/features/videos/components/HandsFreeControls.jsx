
import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Hand,
  Volume2,
  VolumeX,
  Sparkles,
} from "lucide-react";

const VISION_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * Contrôles mains libres BAARO.
 *
 * Props attendues :
 * activeVideoId : identifiant de la vidéo active
 * onNext() : vidéo suivante
 * onPrevious() : vidéo précédente
 * onLike(videoId) : aimer la vidéo active
 * onTogglePlayback() : pause / reprise
 * onToggleMute() : activer / couper le son
 * onOpenComments(videoId) : ouvrir les commentaires
 * onToggleFullscreen(videoId) : plein écran
 */
export default function HandsFreeControls({
  activeVideoId,
  onNext,
  onPrevious,
  onLike,
  onTogglePlayback,
  onToggleMute,
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
  const lastGestureRef = useRef(0);
  const previousHandXRef = useRef(null);
  const previousNoseRef = useRef(null);
  const voiceEnabledRef = useRef(false);

  // Les callbacks restent à jour sans relancer la caméra.
  const actionsRef = useRef({});
  actionsRef.current = {
    activeVideoId,
    onNext,
    onPrevious,
    onLike,
    onTogglePlayback,
    onToggleMute,
    onOpenComments,
    onToggleFullscreen,
  };

  const runGesture = useCallback((action, label) => {
    const now = Date.now();

    // Empêche plusieurs actions pour un même geste.
    if (now - lastGestureRef.current < 1400) return;

    lastGestureRef.current = now;
    setStatus(label);

    const a = actionsRef.current;
    const id = a.activeVideoId;

    if (action === "next") a.onNext?.();
    if (action === "previous") a.onPrevious?.();
    if (action === "like" && id != null) a.onLike?.(id);
    if (action === "play") a.onTogglePlayback?.();
    if (action === "mute") a.onToggleMute?.();
  }, []);

  // Reconnaissance des commandes vocales.
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;

    if (!voiceEnabled) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        "La reconnaissance vocale n'est pas prise en charge par ce navigateur."
      );
      setVoiceEnabled(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result?.isFinal) return;

      const command = result[0].transcript
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      const a = actionsRef.current;
      const id = a.activeVideoId;

      if (
        /\b(video suivante|suivante|video d'apres|passe|suivant)\b/.test(command)
      ) {
        a.onNext?.();
        setStatus("Commande : vidéo suivante");
      } else if (
        /\b(video precedente|precedente|retour en arriere)\b/.test(command)
      ) {
        a.onPrevious?.();
        setStatus("Commande : vidéo précédente");
      } else if (
        /\b(j'aime|jaime|like|aime cette video)\b/.test(command)
      ) {
        if (id != null) a.onLike?.(id);
        setStatus("Commande : j'aime");
      } else if (
        /\b(pause|arrete la video|mettre en pause)\b/.test(command)
      ) {
        a.onTogglePlayback?.();
        setStatus("Commande : pause / reprise");
      } else if (
        /\b(reprendre|reprends|continue la video)\b/.test(command)
      ) {
        // Ce callback bascule pause/reprise : à utiliser si l'état
        // actuel est en pause. Voir la note d'intégration ci-dessous.
        a.onTogglePlayback?.();
        setStatus("Commande : reprise");
      } else if (
        /\b(couper le son|muet|desactiver le son)\b/.test(command)
      ) {
        a.onToggleMute?.();
        setStatus("Commande : son");
      } else if (
        /\b(activer le son|remettre le son)\b/.test(command)
      ) {
        a.onToggleMute?.();
        setStatus("Commande : son");
      } else if (/\b(commentaires|ouvrir les commentaires)\b/.test(command)) {
        if (id != null) a.onOpenComments?.(id);
        setStatus("Commande : commentaires");
      } else if (/\b(plein ecran|agrandir la video)\b/.test(command)) {
        if (id != null) a.onToggleFullscreen?.(id);
        setStatus("Commande : plein écran");
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        setError(`Reconnaissance vocale : ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (voiceEnabledRef.current) {
        try {
          recognition.start();
        } catch {
          // Le navigateur peut déjà être en cours de redémarrage.
        }
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
      voiceEnabledRef.current = false;
      recognition.onend = null;
      recognition.stop();
    };
  }, [voiceEnabled]);

  // Initialisation et arrêt de la caméra et des modèles de vision.
  useEffect(() => {
    if (!cameraEnabled) return;

    let cancelled = false;
    let lastDetectionAt = 0;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Caméra indisponible dans ce navigateur.");
        }

        setError("");
        setStatus("Initialisation de la détection des gestes");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const vision = await FilesetResolver.forVisionTasks(VISION_WASM);

        const handModel = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL },
          runningMode: "VIDEO",
          numHands: 1,
        });

        if (cancelled) {
          handModel.close();
          return;
        }

        const faceModel = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: "VIDEO",
          numFaces: 1,
        });

        if (cancelled) {
          handModel.close();
          faceModel.close();
          return;
        }

        handModelRef.current = handModel;
        faceModelRef.current = faceModel;
        setStatus("Caméra active — gestes disponibles");

        const detect = (timestamp) => {
          if (cancelled) return;

          rafRef.current = requestAnimationFrame(detect);

          // Réduit la charge sur les téléphones moins puissants.
          if (timestamp - lastDetectionAt < 180) return;
          lastDetectionAt = timestamp;

          const video = videoRef.current;
          if (!video || video.readyState < 2) return;

          try {
            const handResult = handModel.detectForVideo(video, timestamp);
            const faceResult = faceModel.detectForVideo(video, timestamp);

            const now = Date.now();
            const canTrigger = now - lastGestureRef.current > 1400;

            // Gestes de la main : pouce levé, paume ouverte et balayage.
            const hand = handResult.landmarks?.[0];

            if (hand && canTrigger) {
              const wrist = hand[0];
              const thumbTip = hand[4];
              const thumbJoint = hand[3];

              const indexTip = hand[8];
              const indexPip = hand[6];
              const middleTip = hand[12];
              const middlePip = hand[10];
              const ringTip = hand[16];
              const ringPip = hand[14];
              const pinkyTip = hand[20];
              const pinkyPip = hand[18];

              const fingersOpen = [
                indexTip.y < indexPip.y,
                middleTip.y < middlePip.y,
                ringTip.y < ringPip.y,
                pinkyTip.y < pinkyPip.y,
              ];

              const openPalm = fingersOpen.every(Boolean);
              const thumbUp =
                thumbTip.y < thumbJoint.y &&
                !fingersOpen.every(Boolean) &&
                !fingersOpen[0] &&
                !fingersOpen[1];

              if (thumbUp) {
                runGesture("like", "Geste : j'aime");
              } else if (openPalm) {
                // Paume ouverte : pause/reprise.
                runGesture("play", "Geste : pause / reprise");
              } else if (previousHandXRef.current != null) {
                const dx = wrist.x - previousHandXRef.current;

                if (Math.abs(dx) > 0.22) {
                  // Image miroir : le sens peut varier selon l'appareil.
                  runGesture(
                    dx < 0 ? "next" : "previous",
                    dx < 0 ? "Geste : vidéo suivante" : "Geste : vidéo précédente"
                  );
                }
              }

              previousHandXRef.current = wrist.x;
            } else if (!hand) {
              previousHandXRef.current = null;
            }

            // Mouvements de tête : mouvement horizontal = navigation.
            // Le ton de la voix ne déclenche jamais d'action.
            const face = faceResult.faceLandmarks?.[0];

            if (face && canTrigger) {
              // Point 1 : nez approximatif dans les repères MediaPipe.
              const nose = face[1];

              if (previousNoseRef.current) {
                const dx = nose.x - previousNoseRef.current.x;
                const dy = nose.y - previousNoseRef.current.y;

                if (Math.abs(dx) > 0.12) {
                  runGesture(
                    dx < 0 ? "next" : "previous",
                    dx < 0 ? "Tête : vidéo suivante" : "Tête : vidéo précédente"
                  );
                } else if (Math.abs(dy) > 0.14) {
                  // Inclinaison verticale : pause/reprise.
                  runGesture("play", "Tête : pause / reprise");
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

        rafRef.current = requestAnimationFrame(detect);
      } catch (err) {
        setError(err?.message || "Impossible d'activer les gestes.");
        setCameraEnabled(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      handModelRef.current?.close();
      faceModelRef.current?.close();
      handModelRef.current = null;
      faceModelRef.current = null;

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (videoRef.current) videoRef.current.srcObject = null;

      previousHandXRef.current = null;
      previousNoseRef.current = null;
    };
  }, [cameraEnabled, runGesture]);

  return (
    <section className="fixed bottom-24 left-3 z-[60] w-[min(290px,calc(100vw-24px))] rounded-2xl border border-white/15 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        aria-hidden="true"
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
        <button
          type="button"
          onClick={() => {
            setError("");
            setVoiceEnabled((value) => !value);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold ${
            voiceEnabled
              ? "bg-yellow-400 text-black"
              : "bg-white/10 text-white"
          }`}
        >
          {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          {voiceEnabled ? "Voix active" : "Activer la voix"}
        </button>

        <button
          type="button"
          onClick={() => {
            setError("");
            setCameraEnabled((value) => !value);
          }}
          className={`flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-bold ${
            cameraEnabled
              ? "bg-yellow-400 text-black"
              : "bg-white/10 text-white"
          }`}
        >
          {cameraEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
          {cameraEnabled ? "Gestes actifs" : "Activer les gestes"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/15 p-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-white/50">
        Voix : « vidéo suivante », « j'aime », « pause », « activer le son »,
        « commentaires ». La caméra s'arrête lorsque les gestes sont désactivés.
      </p>
    </section>
  );
}
