import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecorderMime } from "../utils/videoRenderer.js";

// Créateur caméra : aucun plafond de durée imposé par BAARO.
// onOpen : appelé à l'ouverture (ex. afficher la fenêtre de publication).
// onRecorded(file) : appelé avec le fichier vidéo une fois l'enregistrement terminé.
export function useCamera({ onOpen, onRecorded } = {}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraSeconds, setCameraSeconds] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const cameraChunksRef = useRef([]);
  const cameraTimerRef = useRef(null);

  // Toujours appeler la dernière version du callback, même depuis recorder.onstop.
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const stopCameraStream = useCallback(() => {
    if (cameraTimerRef.current) {
      clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraRecording(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "La caméra n'est pas disponible dans ce navigateur. Vérifie HTTPS et les permissions.",
      );
      return;
    }

    stopCameraStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(() => {});
      }
      setCameraSeconds(0);
    } catch (error) {
      console.error("BAARO camera:", error);
      setCameraError(
        error?.name === "NotAllowedError"
          ? "Autorise la caméra et le micro dans le navigateur puis réessaie."
          : "Impossible d'ouvrir la caméra. Vérifie les permissions de l'appareil.",
      );
    }
  }, [cameraFacing, stopCameraStream]);

  const openCamera = async () => {
    onOpen?.();
    setCameraOpen(true);
    await startCamera();
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError("");
    setCameraSeconds(0);
  };

  const toggleCameraFacing = async () => {
    if (cameraRecording) return;
    setCameraFacing((value) => (value === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (!cameraOpen || cameraRecording) return;
    startCamera();
    return () => stopCameraStream();
  }, [cameraOpen, cameraFacing, startCamera, stopCameraStream]);

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  const startCameraRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) {
      setCameraError("La caméra n'est pas ouverte.");
      return;
    }
    const mimeType = pickRecorderMime();
    if (!window.MediaRecorder) {
      setCameraError(
        "L'enregistrement vidéo n'est pas supporté par ce navigateur.",
      );
      return;
    }

    cameraChunksRef.current = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (error) {
      console.error(error);
      setCameraError("Impossible de démarrer l'enregistrement.");
      return;
    }

    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) cameraChunksRef.current.push(event.data);
    };
    recorder.onerror = (event) => {
      console.error("BAARO recorder:", event.error);
      setCameraError("Une erreur est survenue pendant l'enregistrement.");
      setCameraRecording(false);
    };
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType || "video/webm").split(
        ";",
      )[0];
      const blob = new Blob(cameraChunksRef.current, { type });
      if (!blob.size) {
        setCameraError("Aucune vidéo n'a été enregistrée.");
        return;
      }
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const file = new File([blob], `baaro-camera-${Date.now()}.${ext}`, {
        type,
        lastModified: Date.now(),
      });
      onRecordedRef.current?.(file);
      setCameraOpen(false);
      setCameraSeconds(0);
      stopCameraStream();
    };

    recorder.start(1000);
    setCameraRecording(true);
    setCameraSeconds(0);
    cameraTimerRef.current = setInterval(() => {
      setCameraSeconds((value) => value + 1);
    }, 1000);
  };

  const stopCameraRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (cameraTimerRef.current) {
      clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    setCameraRecording(false);
  };

  return {
    cameraOpen,
    cameraFacing,
    cameraRecording,
    cameraSeconds,
    cameraError,
    cameraVideoRef,
    openCamera,
    closeCamera,
    toggleCameraFacing,
    startCamera,
    startCameraRecording,
    stopCameraRecording,
  };
}
