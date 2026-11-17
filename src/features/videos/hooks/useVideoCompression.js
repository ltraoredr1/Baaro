import { useCallback, useRef, useState } from "react";

// Compression hybride BAARO
// --------------------------
// 1. Tentative locale légère (MediaRecorder → MP4 H.264) quand le navigateur
//    le supporte vraiment et que le fichier n'est pas trop long / trop lourd.
// 2. Si échec, interruption, ou gain insuffisant → on renvoie l'original
//    le vrai travail (FFmpeg).
// 3. Sur mobile / faible mémoire on est plus agressif (720p, bitrate plus bas)
//    et on abandonne plus vite pour ne pas bloquer Termux / WebView Android.

const MIN_SIZE_BYTES = 8 * 1024 * 1024; // en dessous : inutile de compresser
const MAX_DURATION_S_DESKTOP = 120;
const MAX_DURATION_S_MOBILE = 75;
const MAX_SIDE_DESKTOP = 1280;
const MAX_SIDE_MOBILE = 720;
const VIDEO_BPS_DESKTOP = 2_200_000;
const VIDEO_BPS_MOBILE = 1_400_000;
const AUDIO_BPS = 96_000;
const KEEP_IF_SMALLER_THAN = 0.92; // on garde le résultat s'il gagne au moins \~8 %

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
];

const even = (value) => Math.max(2, Math.round(value / 2) * 2);

function isLikelyMobile() {
  if (typeof navigator === "undefined") return false;
  // Heuristique légère, sans dépendance
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Termux/i.test(ua);
  const smallScreen =
    typeof window !== "undefined" &&
    Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 700;
  const lowMem =
    typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  return mobileUA || smallScreen || lowMem;
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    MIME_CANDIDATES.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) || null
  );
}

export function useVideoCompression() {
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(null);

  /** Garde l'original et abandonne la compression. */
  const cancel = useCallback(() => stopRef.current?.("skip"), []);

  /** Abandonne la compression ET la sélection du fichier (fermeture de la fenêtre). */
  const abort = useCallback(() => stopRef.current?.("abort"), []);

  /**
   * Retourne { file, status } avec status parmi :
   * done | skipped | cancelled | interrupted | failed | aborted (file = null).
   *
   * Quand status !== "done", le fichier original est renvoyé et peut porter
   */
  const compress = useCallback(async (file) => {
    const mimeType = pickMimeType();
    const mobile = isLikelyMobile();
    const maxDuration = mobile ? MAX_DURATION_S_MOBILE : MAX_DURATION_S_DESKTOP;
    const maxSide = mobile ? MAX_SIDE_MOBILE : MAX_SIDE_DESKTOP;
    const videoBps = mobile ? VIDEO_BPS_MOBILE : VIDEO_BPS_DESKTOP;

    // Conditions non prises en charge : conserver le fichier original.
    if (
      !file ||
      !file.type?.startsWith("video/") ||
      file.size < MIN_SIZE_BYTES ||
      typeof HTMLCanvasElement === "undefined" ||
      typeof HTMLCanvasElement.prototype.captureStream !== "function" ||
      !mimeType
    ) {
      return {
        file: file,
        status: "skipped",
      };
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    let audioCtx = null;
    let captureStream = null;
    let frameHandle = 0;
    let usesVideoFrameCallback = false;
    let onVisibility = null;

    const stopDrawing = () => {
      if (!frameHandle) return;
      if (usesVideoFrameCallback) video.cancelVideoFrameCallback?.(frameHandle);
      else cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    };

    const cleanup = () => {
      stopDrawing();
      stopRef.current = null;
      if (onVisibility) {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      captureStream?.getTracks?.().forEach((track) => track.stop());
      captureStream = null;
      audioCtx?.close?.().catch(() => {});
    };

    setCompressing(true);
    setProgress(0);

    try {
      const outcome = await new Promise((resolve) => {
        let finished = false;
        let stopReason = null;
        let recorder = null;
        const chunks = [];

        const finish = (value) => {
          if (finished) return;
          finished = true;
          resolve(value);
        };

        const requestStop = (reason) => {
          stopReason = stopReason || reason;
          video.pause();
          if (recorder && recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {
              finish({
                status: reason === "abort" ? "aborted" : "cancelled",
              });
            }
          } else {
            finish({
              status: reason === "abort" ? "aborted" : "cancelled",
            });
          }
        };

        stopRef.current = requestStop;

        video.muted = false;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.preload = "auto";
        video.onerror = () => requestStop("failed");

        video.onloadedmetadata = () => {
          const { duration, videoWidth, videoHeight } = video;

          if (
            !Number.isFinite(duration) ||
            duration <= 0 ||
            duration > maxDuration ||
            !videoWidth ||
            !videoHeight
          ) {
            finish({ status: "skipped" });
            return;
          }

          const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));
          const width = even(videoWidth * scale);
          const height = even(videoHeight * scale);

          // Si on ne réduit presque rien et que le fichier n'est pas énorme,
          // autant laisser le worker gérer.
          if (scale > 0.92 && file.size < 25 * 1024 * 1024) {
            finish({ status: "skipped" });
            return;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d", {
            alpha: false,
            desynchronized: true,
          });
          if (!context) {
            finish({ status: "failed" });
            return;
          }

          captureStream = canvas.captureStream(mobile ? 24 : 30);

          // Si Web Audio est indisponible, garder la vidéo originale.
          try {
            const AudioContextClass =
              window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
              finish({ status: "failed" });
              return;
            }
            audioCtx = new AudioContextClass();
            const source = audioCtx.createMediaElementSource(video);
            const destination = audioCtx.createMediaStreamDestination();
            source.connect(destination);
            destination.stream
              .getAudioTracks()
              .forEach((track) => captureStream.addTrack(track));
            audioCtx.resume?.().catch(() => {});
          } catch {
            finish({ status: "failed" });
            return;
          }

          try {
            recorder = new MediaRecorder(captureStream, {
              mimeType,
              videoBitsPerSecond: videoBps,
              audioBitsPerSecond: AUDIO_BPS,
            });
          } catch {
            finish({ status: "failed" });
            return;
          }

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
          };

          recorder.onerror = () => requestStop("failed");

          recorder.onstop = () => {
            if (stopReason === "abort") {
              finish({ status: "aborted" });
            } else if (stopReason === "skip" || stopReason === "cancelled") {
              finish({ status: "cancelled" });
            } else if (stopReason === "interrupted") {
              finish({ status: "interrupted" });
            } else if (stopReason === "failed") {
              finish({ status: "failed" });
            } else {
              finish({
                status: "recorded",
                blob: new Blob(chunks, { type: recorder?.mimeType || mimeType }),
              });
            }
          };

          video.onended = () => requestStop("done");

          // En arrière-plan le navigateur gèle le dessin → on abandonne proprement
          onVisibility = () => {
            if (document.hidden) requestStop("interrupted");
          };
          document.addEventListener("visibilitychange", onVisibility);

          let lastPercent = -1;

          const schedule = () => {
            if (finished) return;
            if (video.requestVideoFrameCallback) {
              usesVideoFrameCallback = true;
              frameHandle = video.requestVideoFrameCallback(draw);
            } else {
              frameHandle = requestAnimationFrame(draw);
            }
          };

          function draw() {
            if (finished) return;
            try {
              context.drawImage(video, 0, 0, width, height);
            } catch {
              // frame droppé, on continue
            }
            const percent = Math.min(
              99,
              Math.round((video.currentTime / duration) * 100),
            );
            if (percent !== lastPercent) {
              lastPercent = percent;
              setProgress(percent);
            }
            schedule();
          }

          try {
            recorder.start(1000);
          } catch {
            finish({ status: "failed" });
            return;
          }

          video
            .play()
            .then(() => {
              draw();
            })
            .catch(() => requestStop("interrupted"));
        };

        video.src = url;
      });

      if (outcome.status === "recorded") {
        const blob = outcome.blob;

        if (
          !blob ||
          blob.size === 0 ||
          blob.size > file.size * KEEP_IF_SMALLER_THAN
        ) {
          // Pas assez de gain : on conserve l'original.
          return {
            file: file,
            status: "skipped",
          };
        }

        const baseName = (file.name || "video").replace(/\.[^.]+$/, "") || "video";
        const compressed = new File([blob], `${baseName}.mp4`, {
          type: "video/mp4",
          lastModified: Date.now(),
        });

        // Succès local : pas besoin du worker pour la compression
        return {
          file: compressed,
          status: "done",
        };
      }

      if (outcome.status === "aborted") {
        return { file: null, status: "aborted" };
      }

      // skipped / cancelled / interrupted / failed → original + flag serveur
      return {
        file: file,
        status: outcome.status || "failed",
      };
    } catch {
      return {
        file: file,
        status: "failed",
      };
    } finally {
      cleanup();
      setCompressing(false);
      setProgress(0);
    }
  }, []);

  return { compress, compressing, progress, cancel, abort };
}

export default useVideoCompression;
