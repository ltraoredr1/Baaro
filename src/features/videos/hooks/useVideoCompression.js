import { useCallback, useRef, useState } from "react";

// Compression dans le navigateur avant l'envoi : la vidéo est relue, redessinée
// à une résolution raisonnable puis ré-encodée en MP4 (MediaRecorder).
// La compression se fait en temps réel : une vidéo de 60 s prend ~60 s.
// Si le navigateur ne sait pas produire du MP4, on n'y touche pas
// (un WebM risquerait de ne pas se lire sur iPhone).

const MIN_SIZE_BYTES = 10 * 1024 * 1024; // en dessous : inutile
const MAX_DURATION_S = 180; // au-delà : trop long à ré-encoder
const MAX_SIDE = 1280; // plus grand côté, en pixels
const VIDEO_BPS = 2_500_000;
const AUDIO_BPS = 96_000;
const KEEP_IF_SMALLER_THAN = 0.9; // on garde le résultat s'il gagne au moins 10 %

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
];

const even = (value) => Math.max(2, Math.round(value / 2) * 2);

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;

  return (
    MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ||
    null
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
   */
  const compress = useCallback(async (file) => {
    const mimeType = pickMimeType();

    if (
      !file ||
      !mimeType ||
      !file.type?.startsWith("video/") ||
      file.size < MIN_SIZE_BYTES ||
      !HTMLCanvasElement.prototype.captureStream
    ) {
      return { file, status: "skipped" };
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    let audioCtx = null;
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
      audioCtx?.close?.().catch(() => {});
    };

    setCompressing(true);
    setProgress(0);

    try {
      const outcome = await new Promise((resolve) => {
        let finished = false;
        let stopReason = null;
        let recorder = null;

        const finish = (value) => {
          if (finished) return;
          finished = true;
          resolve(value);
        };

        const requestStop = (reason) => {
          stopReason = stopReason || reason;
          video.pause();

          if (recorder && recorder.state !== "inactive") recorder.stop();
          else finish({ status: reason === "abort" ? "aborted" : "cancelled" });
        };

        stopRef.current = requestStop;

        video.muted = false;
        video.playsInline = true;
        video.preload = "auto";
        video.onerror = () => finish({ status: "failed" });

        video.onloadedmetadata = () => {
          const { duration, videoWidth, videoHeight } = video;

          if (!Number.isFinite(duration) || duration > MAX_DURATION_S || !videoWidth) {
            finish({ status: "skipped" });
            return;
          }

          const scale = Math.min(1, MAX_SIDE / Math.max(videoWidth, videoHeight));
          const width = even(videoWidth * scale);
          const height = even(videoHeight * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext("2d", { alpha: false });
          const stream = canvas.captureStream(30);

          // Le son passe par Web Audio vers un flux d'enregistrement,
          // sans jamais sortir par les haut-parleurs.
          try {
            const AudioContextClass =
              window.AudioContext || window.webkitAudioContext;

            if (AudioContextClass) {
              audioCtx = new AudioContextClass();

              const source = audioCtx.createMediaElementSource(video);
              const destination = audioCtx.createMediaStreamDestination();

              source.connect(destination);
              destination.stream
                .getAudioTracks()
                .forEach((track) => stream.addTrack(track));
              audioCtx.resume?.();
            }
          } catch {
            // vidéo sans son exploitable : on continue en image seule
          }

          const chunks = [];

          try {
            recorder = new MediaRecorder(stream, {
              mimeType,
              videoBitsPerSecond: VIDEO_BPS,
              audioBitsPerSecond: AUDIO_BPS,
            });
          } catch {
            finish({ status: "failed" });
            return;
          }

          recorder.ondataavailable = (event) => {
            if (event.data?.size) chunks.push(event.data);
          };

          recorder.onerror = () => finish({ status: "failed" });

          recorder.onstop = () => {
            if (stopReason === "abort") finish({ status: "aborted" });
            else if (stopReason === "skip") finish({ status: "cancelled" });
            else if (stopReason === "interrupted") {
              finish({ status: "interrupted" });
            } else {
              finish({
                status: "recorded",
                blob: new Blob(chunks, { type: "video/mp4" }),
              });
            }
          };

          video.onended = () => requestStop("done");

          // En arrière-plan le navigateur gèle le dessin : on abandonne proprement.
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

            context.drawImage(video, 0, 0, width, height);

            const percent = Math.min(
              99,
              Math.round((video.currentTime / duration) * 100)
            );

            if (percent !== lastPercent) {
              lastPercent = percent;
              setProgress(percent);
            }

            schedule();
          }

          recorder.start(1000);

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

        if (blob.size === 0 || blob.size > file.size * KEEP_IF_SMALLER_THAN) {
          return { file, status: "skipped" };
        }

        const name = `${file.name.replace(/\.[^.]+$/, "") || "video"}.mp4`;

        return {
          file: new File([blob], name, {
            type: "video/mp4",
            lastModified: Date.now(),
          }),
          status: "done",
        };
      }

      if (outcome.status === "aborted") return { file: null, status: "aborted" };

      return { file, status: outcome.status };
    } catch {
      return { file, status: "failed" };
    } finally {
      cleanup();
      setCompressing(false);
      setProgress(0);
    }
  }, []);

  return { compress, compressing, progress, cancel, abort };
}

export default useVideoCompression;
