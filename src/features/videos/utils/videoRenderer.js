import { CANVAS_H, CANVAS_W, TEXT_THEMES } from "../constants.js";
import { formatTime } from "./format.js";

// Rendu photo/texte vers un fichier vidéo, enregistré directement dans le navigateur.

export const pickRecorderMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return (
    candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ||
    ""
  );
};

export const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Une photo est illisible."));
    img.src = url;
  });

export const wrapText = (ctx, text, maxWidth) => {
  const lines = [];
  text.split("\n").forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  });
  return lines;
};

export const drawCover = (ctx, img, zoom = 1) => {
  const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
};

export const makePhotoDrawer = (images, secondsEach) => {
  const fade = 0.5;
  return (ctx, ms) => {
    const t = ms / 1000;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const idx = Math.min(images.length - 1, Math.floor(t / secondsEach));
    const local = t - idx * secondsEach;
    if (idx > 0 && local < fade) {
      drawCover(ctx, images[idx - 1], 1.08);
      ctx.globalAlpha = local / fade;
    }
    drawCover(ctx, images[idx], 1 + 0.08 * Math.min(1, local / secondsEach));
    ctx.globalAlpha = 1;
  };
};

export const makeTextDrawer = (text, themeIndex) => {
  const [c1, c2] = TEXT_THEMES[themeIndex] || TEXT_THEMES[0];
  let layout = null;
  return (ctx, ms) => {
    const gradient = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(1, c2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (!layout) {
      let size = 84;
      let lines = [];
      for (; size >= 32; size -= 4) {
        ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
        lines = wrapText(ctx, text, CANVAS_W - 120);
        if (lines.length * size * 1.25 <= CANVAS_H - 500) break;
      }
      layout = { size, lines, lh: size * 1.25 };
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = Math.min(1, ms / 500);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${layout.size}px system-ui, -apple-system, sans-serif`;
    const top = CANVAS_H / 2 - ((layout.lines.length - 1) * layout.lh) / 2;
    layout.lines.forEach((line, i) =>
      ctx.fillText(line, CANVAS_W / 2, top + i * layout.lh),
    );

    ctx.globalAlpha = 0.6;
    ctx.font = "700 28px system-ui, -apple-system, sans-serif";
    ctx.fillText("BAARO", CANVAS_W / 2, CANVAS_H - 80);
    ctx.globalAlpha = 1;
  };
};

// Dessine en temps réel sur un canvas, enregistre (image + musique) et renvoie un File.
export const renderToFile = async ({
  drawFrame,
  totalMs,
  audioUrl,
  audioCtx,
  onProgress,
}) => {
  if (!window.MediaRecorder) {
    throw new Error(
      "L'enregistrement vidéo n'est pas supporté par ce navigateur.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  if (!canvas.captureStream) {
    throw new Error(
      "Ce navigateur ne peut pas créer de vidéo depuis le canvas.",
    );
  }
  const ctx = canvas.getContext("2d");
  drawFrame(ctx, 0);
  const stream = canvas.captureStream(30);

  if (audioUrl && audioCtx) {
    let buffer;
    try {
      const response = await fetch(audioUrl);
      buffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
    } catch {
      throw new Error("Impossible de charger le son choisi.");
    }
    const dest = audioCtx.createMediaStreamDestination();
    const gain = audioCtx.createGain();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(dest);
    const endAt = audioCtx.currentTime + totalMs / 1000;
    gain.gain.setValueAtTime(1, Math.max(audioCtx.currentTime, endAt - 0.6));
    gain.gain.linearRampToValueAtTime(0, endAt);
    source.start();
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const mimeType = pickRecorderMime();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined,
  );
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (event) =>
      reject(event.error || new Error("Erreur d'enregistrement."));
  });

  recorder.start(500);
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      drawFrame(ctx, Math.min(elapsed, totalMs));
      onProgress?.(Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());

  const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  if (!blob.size) throw new Error("Aucune vidéo n'a été créée.");
  const ext = type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `baaro-${Date.now()}.${ext}`, {
    type,
    lastModified: Date.now(),
  });
};

export const readDuration = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const value = formatTime(video.duration);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("00:00");
    };
    video.src = url;
  });
