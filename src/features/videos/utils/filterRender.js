import { CANVAS_H, CANVAS_W } from "../constants.js";
import { FaceFxProcessor } from "../faceFx/processor.js";
import { drawFiltered } from "../filters/index.js";
import { pickRecorderMime } from "./videoRenderer.js";

// Application des filtres BAARO à une vidéo réelle (caméra ou fichier importé).
// Tout se fait dans le navigateur : la vidéo est redessinée image par image sur un
// canvas 9:16 (filtre + calques animés) puis réenregistrée avec son son d'origine.

const makeCanvas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  if (!canvas.captureStream) {
    throw new Error("Ce navigateur ne peut pas appliquer de filtre à la vidéo.");
  }
  return canvas;
};

const makeRecorder = (stream) => {
  const mimeType = pickRecorderMime();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 3500000 } : undefined,
  );
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const finished = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (event) =>
      reject(event.error || new Error("Erreur d'enregistrement."));
  });
  const toFile = (prefix) => {
    const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error("Aucune vidéo n'a été créée.");
    const ext = type.includes("mp4") ? "mp4" : "webm";
    return new File([blob], `${prefix}-${Date.now()}.${ext}`, {
      type,
      lastModified: Date.now(),
    });
  };
  return { recorder, finished, toFile };
};

// Caméra en direct : renvoie un flux filtré (image) + pistes audio du micro.
// getSpec() est relu à chaque image : on peut changer de filtre en filmant.
export function createFilteredCameraStream(videoEl, sourceStream, getSpec, getFx = () => null) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  const fxProcessor = new FaceFxProcessor();
  const t0 = performance.now();
  let raf = 0;
  let stopped = false;

  const draw = (now) => {
    if (stopped) return;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (vw && vh && videoEl.readyState >= 2) {
      const f = fxProcessor.process(videoEl, vw, vh, getFx());
      drawFiltered(ctx, f.source, f.w, f.h, getSpec(), now - t0);
    }
    raf = requestAnimationFrame(draw);
  };
  draw(performance.now());

  const stream = canvas.captureStream(30);
  sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    // On n'arrête que la piste image : le micro appartient au flux caméra.
    stream.getVideoTracks().forEach((track) => track.stop());
    fxProcessor.dispose();
  };
  return { stream, stop };
}

// Fichier vidéo importé : relit la vidéo en temps réel à travers le filtre.
export async function renderVideoWithFilter({
  file,
  spec,
  fx = null,
  onProgress,
  signal,
}) {
  if (!window.MediaRecorder) {
    throw new Error("L'enregistrement vidéo n'est pas supporté par ce navigateur.");
  }
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  let audioCtx = null;
  let stream = null;
  let recorder = null;
  let finished = null;
  let raf = 0;
  const fxProcessor = new FaceFxProcessor();
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Vidéo illisible."));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    stream = canvas.captureStream(30);

    // Son d'origine : branché sur un flux d'enregistrement, jamais sur les haut-parleurs.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        audioCtx = new AC();
        await audioCtx.resume?.();
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaElementSource(video).connect(dest);
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch {
        // Pas de son récupérable : on garde l'image filtrée seule.
      }
    }

    const recording = makeRecorder(stream);
    recorder = recording.recorder;
    finished = recording.finished;
    // Évite un rejet non géré si la lecture échoue avant l'attente de onstop.
    finished.catch(() => {});
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    recorder.start(500);

    await video.play();
    const t0 = performance.now();
    await new Promise((resolve, reject) => {
      let abortHandler = null;
      const finish = (error) => {
        cancelAnimationFrame(raf);
        raf = 0;
        if (abortHandler) signal?.removeEventListener("abort", abortHandler);
        error ? reject(error) : resolve();
      };
      abortHandler = () => {
        video.pause();
        if (recorder?.state !== "inactive") recorder?.stop();
        finish(new Error("Filtre annulé."));
      };
      signal?.addEventListener("abort", abortHandler, { once: true });
      video.onended = () => finish();
      video.onerror = () => finish(new Error("Lecture de la vidéo interrompue."));
      const tick = (now) => {
        if (signal?.aborted) return abort();
        if (video.videoWidth) {
          const f = fxProcessor.process(video, video.videoWidth, video.videoHeight, fx);
          drawFiltered(ctx, f.source, f.w, f.h, spec, now - t0);
        }
        if (duration) onProgress?.(Math.min(1, video.currentTime / duration));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    if (recorder.state !== "inactive") recorder.stop();
    await finished;
    return recording.toFile("baaro-filtre");
  } finally {
    if (raf) cancelAnimationFrame(raf);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // L'enregistreur a pu devenir inactif entre le test et stop().
      }
      await finished?.catch(() => {});
    }
    fxProcessor.dispose();
    video.pause();
    video.removeAttribute("src");
    video.load();
    stream?.getTracks().forEach((track) => track.stop());
    audioCtx?.close?.().catch(() => {});
    URL.revokeObjectURL(url);
  }
}
