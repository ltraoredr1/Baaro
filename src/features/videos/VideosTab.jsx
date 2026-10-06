import { VideoTranslateControls } from "../../components/VideoTranslateControls.jsx";
import VideoNextGenStudio from "./VideoNextGenStudio.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Expand,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { uploadExternalMedia } from "../../lib/externalMedia.js";
import { uploadLargeVideo } from "../../lib/largeVideoUpload.js";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { EngagementList } from "../../components/EngagementList.jsx";
import { TipButton } from "../../components/TipButton.jsx";

const formatCount = (value = 0) => {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}K`;
  return String(n);
};

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const isMissingColumn = (error) =>
  !!error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /column|schema cache/i.test(error.message || ""));

// Insère une vidéo ; si les colonnes son (migration 053) n'existent pas encore,
// on réessaie sans elles pour ne jamais bloquer la publication.
const insertVideo = async (base, extra = {}) => {
  const hasExtra = Object.keys(extra).length > 0;
  let res = await supabase
    .from("videos")
    .insert({ ...base, ...extra })
    .select("id")
    .single();
  let degraded = false;
  if (res.error && hasExtra && isMissingColumn(res.error)) {
    res = await supabase.from("videos").insert(base).select("id").single();
    degraded = !res.error;
  }
  return { ...res, degraded };
};

// ---------- Création de vidéo à partir de photos / texte (100 % navigateur) ----------
const CANVAS_W = 720;
const CANVAS_H = 1280;
const MAX_PHOTOS = 10;

const TEXT_THEMES = [
  ["#f59e0b", "#b45309"],
  ["#ec4899", "#7c3aed"],
  ["#06b6d4", "#1d4ed8"],
  ["#22c55e", "#065f46"],
  ["#1f2937", "#000000"],
];

const pickRecorderMime = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Une photo est illisible."));
    img.src = url;
  });

const wrapText = (ctx, text, maxWidth) => {
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

const drawCover = (ctx, img, zoom = 1) => {
  const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height) * zoom;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
};

const makePhotoDrawer = (images, secondsEach) => {
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

const makeTextDrawer = (text, themeIndex) => {
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
    layout.lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, top + i * layout.lh));

    ctx.globalAlpha = 0.6;
    ctx.font = "700 28px system-ui, -apple-system, sans-serif";
    ctx.fillText("BAARO", CANVAS_W / 2, CANVAS_H - 80);
    ctx.globalAlpha = 1;
  };
};

// Dessine en temps réel sur un canvas, enregistre (image + musique) et renvoie un File.
const renderToFile = async ({ drawFrame, totalMs, audioUrl, audioCtx, onProgress }) => {
  if (!window.MediaRecorder) {
    throw new Error("L'enregistrement vidéo n'est pas supporté par ce navigateur.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  if (!canvas.captureStream) {
    throw new Error("Ce navigateur ne peut pas créer de vidéo depuis le canvas.");
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
    mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined
  );
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (event) => reject(event.error || new Error("Erreur d'enregistrement."));
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
  return new File([blob], `baaro-${Date.now()}.${ext}`, { type, lastModified: Date.now() });
};

const loadVideoMeta = (url) =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => reject(new Error("Une vidéo est illisible."));
    video.src = url;
  });

// Studio mixte : enchaîne photos + vidéos et ajoute un texte en surimpression.
// Le rendu reste côté navigateur pour l'aperçu/création rapide; les gros fichiers
// continuent ensuite par le pipeline R2/worker existant.
const renderMixedToFile = async ({ assets, overlayText, audioUrl, audioCtx, onProgress }) => {
  if (!window.MediaRecorder) throw new Error("L'enregistrement vidéo n'est pas supporté par ce navigateur.");
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  if (!canvas.captureStream) throw new Error("Ce navigateur ne peut pas créer de vidéo depuis le canvas.");
  const ctx = canvas.getContext("2d");
  const prepared = [];
  for (const asset of assets) {
    if (asset.type === "image") {
      prepared.push({ ...asset, media: await loadImage(asset.url), duration: Number(asset.duration || 3) });
    } else {
      const video = document.createElement("video");
      video.src = asset.url;
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error("Une vidéo est illisible."));
      });
      prepared.push({ ...asset, media: video, duration: Number.isFinite(video.duration) ? video.duration : 1 });
    }
  }
  const totalMs = prepared.reduce((sum, asset) => sum + Math.max(0.25, asset.duration) * 1000, 0);
  const stream = canvas.captureStream(30);
  let audioSource = null;
  let audioDest = null;
  if (audioUrl && audioCtx) {
    const response = await fetch(audioUrl);
    const buffer = await audioCtx.decodeAudioData(await response.arrayBuffer());
    audioDest = audioCtx.createMediaStreamDestination();
    const gain = audioCtx.createGain();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = buffer;
    audioSource.loop = true;
    audioSource.connect(gain);
    gain.connect(audioDest);
    audioDest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    audioSource.start();
  }

  const mimeType = pickRecorderMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (event) => reject(event.error || new Error("Erreur d'enregistrement."));
  });
  const draw = (elapsedMs) => {
    let cursor = 0;
    let active = prepared[prepared.length - 1];
    let localMs = Math.max(0, elapsedMs);
    for (const asset of prepared) {
      const durationMs = Math.max(0.25, asset.duration) * 1000;
      if (localMs <= durationMs) { active = asset; break; }
      localMs -= durationMs;
      cursor += durationMs;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (active.type === "image") {
      drawCover(ctx, active.media, 1 + 0.05 * Math.min(1, localMs / (active.duration * 1000)));
    } else {
      const video = active.media;
      const localSec = Math.min(active.duration, localMs / 1000);
      if (Math.abs((video.currentTime || 0) - localSec) > 0.15) {
        try { video.currentTime = localSec; } catch {}
      }
      const scale = Math.max(CANVAS_W / (video.videoWidth || CANVAS_W), CANVAS_H / (video.videoHeight || CANVAS_H));
      const w = (video.videoWidth || CANVAS_W) * scale;
      const h = (video.videoHeight || CANVAS_H) * scale;
      ctx.drawImage(video, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
    }
    if (overlayText?.trim()) {
      const text = overlayText.trim();
      ctx.fillStyle = "rgba(0,0,0,.48)";
      ctx.fillRect(35, CANVAS_H - 250, CANVAS_W - 70, 180);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 48;
      let lines;
      for (; size >= 24; size -= 2) {
        ctx.font = `800 ${size}px system-ui, sans-serif`;
        lines = wrapText(ctx, text, CANVAS_W - 120);
        if (lines.length * size * 1.25 <= 150) break;
      }
      const lh = size * 1.25;
      const top = CANVAS_H - 160 - ((lines.length - 1) * lh) / 2;
      lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, top + i * lh));
    }
  };

  recorder.start(500);
  const startedAt = performance.now();
  let lastAssetIndex = -1;
  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = Math.min(totalMs, performance.now() - startedAt);
      let acc = 0;
      let index = prepared.length - 1;
      for (let i = 0; i < prepared.length; i += 1) {
        const d = Math.max(0.25, prepared[i].duration) * 1000;
        if (elapsed <= acc + d) { index = i; break; }
        acc += d;
      }
      if (index !== lastAssetIndex) {
        if (lastAssetIndex >= 0 && prepared[lastAssetIndex].type === "video") prepared[lastAssetIndex].media.pause();
        lastAssetIndex = index;
        if (prepared[index].type === "video") {
          const v = prepared[index].media;
          v.currentTime = 0;
          v.play().catch(() => {});
        }
      }
      draw(elapsed);
      onProgress?.(Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
  prepared.forEach((asset) => { if (asset.type === "video") asset.media.pause(); });
  recorder.stop();
  await stopped;
  audioSource?.stop?.();
  stream.getTracks().forEach((track) => track.stop());
  const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  if (!blob.size) throw new Error("Aucune vidéo n'a été créée.");
  const ext = type.includes("mp4") ? "mp4" : "webm";
  return { file: new File([blob], `baaro-mix-${Date.now()}.${ext}`, { type, lastModified: Date.now() }), totalMs };
};

const readDuration = (file) =>
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

export function VideosTab({ onRewardPoints, onExit }) {
  const { showToast, showPointsReward } = useToast();

  const [videos, setVideos] = useState([]);
  const [sounds, setSounds] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState("forYou");

  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [likedMap, setLikedMap] = useState({});
  const [progress, setProgress] = useState({});
  const [videoErrors, setVideoErrors] = useState({});
  const [showComments, setShowComments] = useState(null);
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState("");
  const [shareId, setShareId] = useState(null);
  const [expandedCaption, setExpandedCaption] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedSound, setSelectedSound] = useState(null);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [previewingSoundId, setPreviewingSoundId] = useState(null);
  const [createMode, setCreateMode] = useState("video");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [mixAssets, setMixAssets] = useState([]);
  const mixInputRef = useRef(null);
  const [photoSeconds, setPhotoSeconds] = useState(3);
  const [textContent, setTextContent] = useState("");
  const [textTheme, setTextTheme] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [bakedAudio, setBakedAudio] = useState(false);
  const [generatedSeconds, setGeneratedSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [nextGenOpen, setNextGenOpen] = useState(false);
  const [engagement, setEngagement] = useState(null);

  // Créateur caméra : aucun plafond de durée imposé par BAARO.
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

  const videoRefs = useRef({});
  const audioRefs = useRef({});
  const mutedRef = useRef(true);
  const soundPreviewRef = useRef(null);
  const soundFileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewAudioRef = useRef(null);
  const observerRef = useRef(null);
  const viewedRef = useRef(new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const buildSelect = (withSound) => `
        id,
        title,
        description,
        video_url,
        thumbnail_url,
        duration,
        views,
        likes,
        comments_count,
        is_repost,
        created_at,
        author_id,
        sound_id,${withSound ? "\n        sound_url,\n        sound_title,\n        mute_original," : ""}
        profiles:author_id (
          display_name,
          handle,
          flag,
          avatar_url
        )
      `;

      const fetchFeed = (withSound) =>
        supabase
          .from("videos")
          .select(buildSelect(withSound))
          .order("created_at", { ascending: false })
          .limit(100);

      let { data, error } = await fetchFeed(true);
      if (error && isMissingColumn(error)) {
        ({ data, error } = await fetchFeed(false));
      }

      if (error) throw error;
      setVideos(data || []);

      if (user?.id) {
        const { data: likes } = await supabase
          .from("video_likes")
          .select("video_id")
          .eq("user_id", user.id);

        const map = {};
        (likes || []).forEach((item) => {
          map[item.video_id] = true;
        });
        setLikedMap(map);
      }
    } catch (error) {
      console.error(error);
      setLoadError(error.message || "Impossible de charger les vidéos.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    let active = true;

    (async () => {
      const merged = new Map();
      try {
        const { data } = await supabase
          .from("sounds")
          .select("*")
          .order("usage_count", { ascending: false })
          .limit(50);
        (data || []).forEach((item) => {
          if (item?.audio_url) merged.set(String(item.id), item);
        });
      } catch {
        // table absente ou inaccessible : on continue avec la bibliothèque audio
      }
      try {
        const { data, error } = await supabase.rpc("search_audio_library", {
          p_query: null,
          p_genre: null,
          p_limit: 50,
        });
        if (!error) {
          (data || []).forEach((track) => {
            const key = String(track.id);
            if (track?.audio_url && !merged.has(key)) {
              merged.set(key, {
                id: track.id,
                title: track.title,
                artist: track.artist,
                audio_url: track.audio_url,
              });
            }
          });
        }
      } catch {
        // bibliothèque audio indisponible
      }
      if (active) setSounds(Array.from(merged.values()));
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("baaro-videos-v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        () => loadVideos()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadVideos]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const visibleVideos = useMemo(() => {
    const list = [...videos];

    if (mode === "trending") {
      return list.sort((a, b) => {
        const scoreA = Number(a.views || 0) + Number(a.likes || 0) * 4 + Number(a.comments_count || 0) * 6;
        const scoreB = Number(b.views || 0) + Number(b.likes || 0) * 4 + Number(b.comments_count || 0) * 6;
        return scoreB - scoreA;
      });
    }

    return list;
  }, [videos, mode]);

  useEffect(() => {
    if (!visibleVideos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.7)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        Object.values(videoRefs.current).forEach((el) => {
          if (!el) return;
          if (visible?.target === el) return;
          el.pause();
        });

        if (!visible) return;

        const video = visible.target;
        const id = video.dataset.id;
        setPlayingId(id);

        if (id && !viewedRef.current.has(id)) {
          viewedRef.current.add(id);
          supabase
            .rpc("register_video_view", { p_video_id: id })
            .then(({ error }) => {
              if (error) console.debug("view registration:", error.message);
            });
        }

        video.muted = mutedRef.current || video.dataset.muteOriginal === "1";
        video.play().catch(() => {
          video.muted = true;
          mutedRef.current = true;
          setMuted(true);
          video.play().catch(() => {});
        });
      },
      { threshold: [0.7, 0.85, 1] }
    );

    observerRef.current = observer;

    Object.values(videoRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleVideos]);

  const soundsById = useMemo(() => {
    const map = {};
    sounds.forEach((item) => {
      map[String(item.id)] = item;
    });
    return map;
  }, [sounds]);

  const getVideoSound = useCallback(
    (video) => {
      const known = video.sound_id ? soundsById[String(video.sound_id)] : null;
      const url = video.sound_url || known?.audio_url || null;
      if (!url) return null;
      return {
        url,
        title: video.sound_title || known?.title || "Son BAARO",
        artist: known?.artist || "",
      };
    },
    [soundsById]
  );

  const syncAudioTime = (videoEl, audio) => {
    if (!videoEl || !audio) return;
    let t = videoEl.currentTime || 0;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) t = t % d;
    if (Math.abs((audio.currentTime || 0) - t) > 0.4) {
      try {
        audio.currentTime = t;
      } catch {
        // métadonnées pas encore chargées
      }
    }
  };

  const playAudioFor = (id, videoEl) => {
    const audio = audioRefs.current[id];
    if (!audio) return;
    audio.muted = mutedRef.current;
    syncAudioTime(videoEl, audio);
    if (!mutedRef.current) audio.play().catch(() => {});
  };

  const togglePlay = (id) => {
    const video = videoRefs.current[id];
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      setPlayingId(String(id));
    } else {
      video.pause();
      setPlayingId(null);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);

    Object.entries(videoRefs.current).forEach(([vid, el]) => {
      if (el) el.muted = next || el.dataset.muteOriginal === "1";
      const audio = audioRefs.current[vid];
      if (audio) audio.muted = next;
    });

    // Le geste utilisateur autorise enfin la lecture du son.
    if (!next && playingId) {
      const current = videoRefs.current[playingId];
      if (current && !current.paused) playAudioFor(playingId, current);
    }
  };

  const toggleFullscreen = async (id) => {
    const video = videoRefs.current[id];
    if (!video) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (video.requestFullscreen) {
        await video.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the browser/webview.
    }
  };

  const handleTimeUpdate = (id, event) => {
    const video = event.currentTarget;
    const value = video.duration ? video.currentTime / video.duration : 0;
    setProgress((prev) => ({ ...prev, [id]: value }));

    const audio = audioRefs.current[id];
    if (audio && !video.paused) syncAudioTime(video, audio);
  };

  const handleLike = async (videoId) => {
    if (!user) {
      showToast("Connecte-toi pour aimer une vidéo.", "error");
      return;
    }

    const wasLiked = !!likedMap[videoId];

    setLikedMap((prev) => ({ ...prev, [videoId]: !wasLiked }));
    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId
          ? {
              ...video,
              likes: Math.max(0, Number(video.likes || 0) + (wasLiked ? -1 : 1)),
            }
          : video
      )
    );

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", videoId)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("video_likes")
          .insert({ video_id: videoId, user_id: user.id });

        if (error) throw error;

        onRewardPoints?.("like_video", "Vidéo aimée", videoId);
        showPointsReward?.(2, "Vidéo aimée");
      }
    } catch (error) {
      console.error(error);
      setLikedMap((prev) => ({ ...prev, [videoId]: wasLiked }));
      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? {
                ...video,
                likes: Math.max(0, Number(video.likes || 0) + (wasLiked ? 1 : -1)),
              }
            : video
        )
      );
      showToast("Impossible de modifier le like.", "error");
    }
  };

  const openComments = async (videoId) => {
    setShowComments(videoId);

    const { data, error } = await supabase
      .from("video_comments")
      .select("id, content, created_at, profiles:author_id(display_name, handle, flag, avatar_url)")
      .eq("video_id", videoId)
      .order("created_at", { ascending: true });

    if (error) {
      showToast("Impossible de charger les commentaires.", "error");
      return;
    }

    setComments((prev) => ({ ...prev, [videoId]: data || [] }));
  };

  const sendComment = async () => {
    if (!user || !showComments || !newComment.trim()) return;

    const text = newComment.trim();

    try {
      const { data, error } = await supabase
        .from("video_comments")
        .insert({
          video_id: showComments,
          author_id: user.id,
          content: text,
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewComment("");
      await openComments(showComments);

      setVideos((prev) =>
        prev.map((video) =>
          video.id === showComments
            ? { ...video, comments_count: Number(video.comments_count || 0) + 1 }
            : video
        )
      );

      onRewardPoints?.("comment_video", "Commentaire", data?.id);
      showPointsReward?.(2, "Commentaire");
    } catch (error) {
      console.error(error);
      showToast("Impossible d'envoyer le commentaire.", "error");
    }
  };

  const handleShare = async (video) => {
    const url = `${window.location.origin}?video=${encodeURIComponent(video.id)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: video.title || "Vidéo BAARO",
          text: "Regarde cette vidéo sur BAARO",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareId(video.id);
        showToast("Lien copié !", "success");
        setTimeout(() => setShareId(null), 1800);
      }
    } catch {
      // User cancelled the native share sheet.
    }
  };

  const handleRepost = async (video) => {
    if (!user) {
      showToast("Connecte-toi pour reposter.", "error");
      return;
    }

    try {
      const { data, error } = await insertVideo(
        {
          author_id: user.id,
          video_url: video.video_url,
          title: `🔁 ${video.title || "Vidéo BAARO"}`,
          description: `Repost de @${video.profiles?.handle || "membre"}`,
          duration: video.duration || "00:00",
          views: 0,
          likes: 0,
          is_repost: true,
          original_author_id: video.author_id,
          sound_id: video.sound_id || null,
        },
        video.sound_url
          ? {
              sound_url: video.sound_url,
              sound_title: video.sound_title || null,
              mute_original: !!video.mute_original,
            }
          : {}
      );

      if (error) throw error;

      onRewardPoints?.("repost_video", "Repost", data?.id);
      showPointsReward?.(5, "Repost");
      showToast("Vidéo repostée !", "success");
      loadVideos();
    } catch (error) {
      console.error(error);
      showToast("Impossible de reposter cette vidéo.", "error");
    }
  };

  const handleDelete = async (videoId) => {
    if (!user) return;
    if (!window.confirm("Supprimer cette vidéo ?")) return;

    try {
      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", videoId)
        .eq("author_id", user.id);

      if (error) throw error;

      setVideos((prev) => prev.filter((video) => video.id !== videoId));
      delete videoRefs.current[videoId];
      showToast("Vidéo supprimée.", "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de supprimer la vidéo.", "error");
    }
  };


  const stopCameraStream = useCallback(() => {
    if (cameraTimerRef.current) {
      clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
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
      setCameraError("La caméra n'est pas disponible dans ce navigateur. Vérifie HTTPS et les permissions.");
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
          : "Impossible d'ouvrir la caméra. Vérifie les permissions de l'appareil."
      );
    }
  }, [cameraFacing, stopCameraStream]);

  const openCamera = async () => {
    setShowUpload(true);
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
  }, [cameraOpen, cameraFacing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  const startCameraRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) {
      setCameraError("La caméra n'est pas ouverte.");
      return;
    }
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mimeType = candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
    if (!window.MediaRecorder) {
      setCameraError("L'enregistrement vidéo n'est pas supporté par ce navigateur.");
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
      const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
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
      handleFileSelected(file);
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

  const stopSoundPreview = useCallback(() => {
    if (soundPreviewRef.current) {
      soundPreviewRef.current.pause();
      soundPreviewRef.current = null;
    }
    setPreviewingSoundId(null);
  }, []);

  useEffect(() => () => stopSoundPreview(), [stopSoundPreview]);

  const toggleSoundPreview = (sound) => {
    const key = String(sound.id ?? sound.audio_url);
    if (previewingSoundId === key) {
      stopSoundPreview();
      return;
    }
    stopSoundPreview();
    if (!sound.audio_url) {
      showToast("Ce son n'a pas de fichier audio.", "error");
      return;
    }
    const audio = new Audio(sound.audio_url);
    audio.onended = () => stopSoundPreview();
    audio.onerror = () => {
      showToast("Impossible de lire ce son.", "error");
      stopSoundPreview();
    };
    soundPreviewRef.current = audio;
    setPreviewingSoundId(key);
    audio.play().catch(() => stopSoundPreview());
  };

  const chooseSound = async (sound) => {
    stopSoundPreview();
    setSelectedSound(sound);
    if (sound?.id) {
      try { await supabase.rpc("record_sound_usage", { p_sound_id: String(sound.id) }); } catch {}
    }
    if (!sound) setMuteOriginal(false);
    setShowSoundPicker(false);
  };

  const handleSoundFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      showToast("Sélectionne un fichier audio.", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("Audio trop lourd (20 Mo max).", "error");
      return;
    }
    chooseSound({
      id: null,
      title: file.name.replace(/\.[^.]+$/, "") || "Mon audio",
      artist: "Audio importé",
      audio_url: URL.createObjectURL(file),
      file,
    });
  };

  const handlePhotosSelected = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!incoming.length) {
      showToast("Sélectionne des photos.", "error");
      return;
    }
    setPhotoFiles((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (incoming.length > room) showToast(`${MAX_PHOTOS} photos maximum.`, "error");
      const added = incoming
        .filter((f) => f.size <= 15 * 1024 * 1024)
        .slice(0, Math.max(0, room))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
        }));
      return [...prev, ...added];
    });
  };

  const handleMixSelected = async (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!incoming.length) {
      showToast("Ajoute une photo ou une vidéo.", "error");
      return;
    }
    const room = Math.max(0, MAX_PHOTOS - mixAssets.length);
    const selected = incoming.slice(0, room);
    const added = [];
    for (const file of selected) {
      const url = URL.createObjectURL(file);
      try {
        const type = file.type.startsWith("image/") ? "image" : "video";
        const duration = type === "image" ? photoSeconds : await loadVideoMeta(url);
        added.push({ id: crypto.randomUUID(), file, url, type, duration: type === "video" ? Math.max(0.25, duration) : photoSeconds });
      } catch (error) {
        URL.revokeObjectURL(url);
        showToast(error.message || "Fichier illisible.", "error");
      }
    }
    setMixAssets((prev) => [...prev, ...added]);
    if (incoming.length > room) showToast(`${MAX_PHOTOS} éléments maximum dans une création rapide.`, "error");
  };

  const removeMixAsset = (id) => {
    setMixAssets((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const removePhoto = (id) => {
    setPhotoFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleGenerate = async () => {
    if (generating) return;
    const wantSound = !!selectedSound?.audio_url;
    let audioCtx = null;

    try {
      if (wantSound) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioCtx = new AC();
          audioCtx.resume?.().catch(() => {});
        }
      }

      stopSoundPreview();
      setGenerating(true);
      setGenerateProgress(0);

      let drawFrame;
      let totalMs;

      if (createMode === "mix") {
        if (!mixAssets.length) {
          showToast("Ajoute au moins une photo ou une vidéo.", "error");
          return;
        }
        const rendered = await renderMixedToFile({
          assets: mixAssets,
          overlayText: textContent,
          audioUrl: wantSound ? selectedSound.audio_url : null,
          audioCtx,
          onProgress: setGenerateProgress,
        });
        handleFileSelected(rendered.file);
        setGenerated(true);
        setBakedAudio(wantSound);
        setGeneratedSeconds(Math.round(rendered.totalMs / 1000));
        return;
      }

      if (createMode === "photo") {
        if (!photoFiles.length) {
          showToast("Ajoute au moins une photo.", "error");
          return;
        }
        const images = await Promise.all(photoFiles.map((item) => loadImage(item.url)));
        totalMs = images.length * photoSeconds * 1000;
        drawFrame = makePhotoDrawer(images, photoSeconds);
      } else {
        const text = textContent.trim();
        if (!text) {
          showToast("Écris ton texte.", "error");
          return;
        }
        const words = text.split(/\s+/).length;
        totalMs = Math.min(15, Math.max(5, Math.ceil(words * 0.5))) * 1000;
        drawFrame = makeTextDrawer(text, textTheme);
      }

      const file = await renderToFile({
        drawFrame,
        totalMs,
        audioUrl: wantSound ? selectedSound.audio_url : null,
        audioCtx,
        onProgress: setGenerateProgress,
      });

      handleFileSelected(file);
      setGenerated(true);
      setBakedAudio(wantSound);
      setGeneratedSeconds(Math.round(totalMs / 1000));
    } catch (error) {
      console.error(error);
      showToast(`Création impossible : ${error.message || "erreur"}`, "error");
    } finally {
      audioCtx?.close?.().catch(() => {});
      setGenerating(false);
      setGenerateProgress(0);
    }
  };

  const backToCreator = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setGenerated(false);
    setBakedAudio(false);
  };

  const resetUpload = () => {
    stopSoundPreview();
    setMuteOriginal(false);
    photoFiles.forEach((item) => URL.revokeObjectURL(item.url));
    mixAssets.forEach((item) => URL.revokeObjectURL(item.url));
    setPhotoFiles([]);
    setMixAssets([]);
    setTextContent("");
    setGenerated(false);
    setBakedAudio(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setUploadTitle("");
    setUploadDescription("");
    setSelectedSound(null);
    setShowSoundPicker(false);
    setUploadProgress(0);
  };

  const handleFileSelected = (file) => {
    if (!file) return;
    const isVideo =
      (file.type && file.type.startsWith("video/")) ||
      /\.(mp4|webm|mov|m4v|mkv|3gp|avi)$/i.test(file.name || "");
    if (!isVideo) {
      showToast("Sélectionne un fichier vidéo.", "error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setGenerated(false);
    setBakedAudio(false);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("Sélectionne une vidéo.", "error");
      return;
    }

    if (!user) {
      showToast("Connecte-toi pour publier.", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const result = await uploadLargeVideo(selectedFile, {
        onProgress: (progress) => setUploadProgress(Math.max(10, Math.min(65, 10 + Math.round(progress * 0.55)))),
      });
      setUploadProgress(65);

      const duration = generated
        ? formatTime(generatedSeconds)
        : await readDuration(selectedFile);

      // Son séparé (vidéo importée/filmée) : on envoie l'audio importé si besoin.
      let soundUrl = null;
      if (selectedSound?.audio_url && !bakedAudio) {
        soundUrl = selectedSound.audio_url;
        if (selectedSound.file) {
          const audioResult = await uploadExternalMedia(selectedSound.file, {
            folder: "videos",
            userId: user.id,
            maxBytes: 100 * 1024 * 1024,
          });
          soundUrl = audioResult.url;
        }
      }
      setUploadProgress(80);

      const { data: created, error: dbError, degraded } = await insertVideo(
        {
          author_id: user.id,
          video_url: result.url,
          title: uploadTitle.trim() || "Vidéo BAARO",
          description: uploadDescription.trim() || null,
          duration,
          views: 0,
          likes: 0,
          sound_id: selectedSound?.id ? String(selectedSound.id) : null,
        },
        selectedSound
          ? {
              sound_title: selectedSound.title || null,
              ...(soundUrl ? { sound_url: soundUrl, mute_original: !!muteOriginal } : {}),
            }
          : {}
      );

      if (dbError) throw dbError;

      setUploadProgress(100);
      onRewardPoints?.("publish_video", "Vidéo publiée", created?.id);
      showPointsReward?.(25, "Vidéo publiée");
      showToast("Vidéo publiée avec succès 🎉", "success");
      if (degraded && soundUrl) {
        showToast("Son non enregistré : applique la migration 053_video_sounds.sql.", "error");
      }

      setShowUpload(false);
      resetUpload();
      await loadVideos();
    } catch (error) {
      console.error(error);
      showToast(`Erreur : ${error.message || "publication impossible"}`, "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-sm text-white/60">Chargement des vidéos…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black text-white overflow-y-auto snap-y snap-mandatory no-scrollbar"
        style={{
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <header className="fixed top-0 left-0 right-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-2">
              {onExit && (
                <button
                  onClick={onExit}
                  className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                  aria-label="Retour"
                >
                  <X size={18} />
                </button>
              )}
              <div>
                <h1 className="text-base font-black tracking-tight">BAARO</h1>
                <p className="text-[10px] text-white/50">Vidéos</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                aria-label={muted ? "Activer le son" : "Couper le son"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                onClick={() => setNextGenOpen(true)}
                className="h-9 px-3 rounded-full bg-white/10 backdrop-blur-md flex items-center gap-1.5 text-[10px] font-black"
                aria-label="Studio vidéo NextGen"
              >
                <Sparkles size={14} /> NextGen
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="h-9 w-9 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: COLORS.gold, color: "#000" }}
                aria-label="Publier"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex justify-center">
            <div className="p-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex gap-1">
              <button
                onClick={() => setMode("forYou")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                  mode === "forYou" ? "bg-white text-black" : "text-white/60"
                }`}
              >
                Pour toi
              </button>
              <button
                onClick={() => setMode("trending")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                  mode === "trending" ? "bg-white text-black" : "text-white/60"
                }`}
              >
                Tendances
              </button>
            </div>
          </div>
        </header>

        {loadError ? (
          <section className="min-h-[100dvh] flex items-center justify-center px-6 text-center snap-start">
            <div>
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="font-black text-xl">Impossible de charger les vidéos</h2>
              <p className="text-sm text-white/50 mt-2 mb-5">{loadError}</p>
              <button
                onClick={loadVideos}
                className="px-5 py-3 rounded-2xl font-bold"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                Réessayer
              </button>
            </div>
          </section>
        ) : visibleVideos.length === 0 ? (
          <section className="min-h-[100dvh] flex items-center justify-center px-6 text-center snap-start">
            <div>
              <div className="text-6xl mb-5">🎬</div>
              <h2 className="font-black text-2xl">Aucune vidéo</h2>
              <p className="text-sm text-white/50 mt-2 mb-6">
                Sois le premier à publier une vidéo sur BAARO.
              </p>
              <button
                onClick={() => setShowUpload(true)}
                className="px-6 py-3 rounded-2xl font-black"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                Publier une vidéo
              </button>
            </div>
          </section>
        ) : (
          visibleVideos.map((video) => {
            const id = String(video.id);
            const isPlaying = playingId === id;
            const liked = !!likedMap[video.id];
            const profile = video.profiles || {};
            const captionOpen = expandedCaption === video.id;
            const caption = [video.title, video.description].filter(Boolean).join(" · ");
            const sound = getVideoSound(video);

            return (
              <article
                key={video.id}
                className="relative h-[100dvh] min-h-[620px] w-full snap-start bg-black overflow-hidden"
              >
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[video.id] = el;
                  }}
                  data-id={id}
                  src={video.video_url}
                  poster={video.thumbnail_url || undefined}
                  className="absolute inset-0 h-full w-full object-cover"
                  playsInline
                  loop
                  muted={muted || !!video.mute_original}
                  data-mute-original={video.mute_original ? "1" : "0"}
                  preload="metadata"
                  onPlay={(event) => {
                    setPlayingId(id);
                    playAudioFor(video.id, event.currentTarget);
                  }}
                  onPause={() => {
                    setPlayingId((current) => (current === id ? null : current));
                    audioRefs.current[video.id]?.pause();
                  }}
                  onSeeked={(event) =>
                    syncAudioTime(event.currentTarget, audioRefs.current[video.id])
                  }
                  onTimeUpdate={(event) => handleTimeUpdate(video.id, event)}
                  onError={() =>
                    setVideoErrors((prev) => ({ ...prev, [video.id]: true }))
                  }
                  onClick={() => togglePlay(video.id)}
                />

                {sound && (
                  <audio
                    ref={(el) => {
                      if (el) audioRefs.current[video.id] = el;
                      else delete audioRefs.current[video.id];
                    }}
                    src={sound.url}
                    loop
                    preload="auto"
                    muted={muted}
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 pointer-events-none" />

                {videoErrors[video.id] && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 text-center px-6">
                    <div>
                      <div className="text-5xl mb-4">⚠️</div>
                      <p className="font-black text-lg">Vidéo indisponible</p>
                      <p className="text-xs text-white/50 mt-2 mb-5">
                        Le fichier n'a pas pu être lu.
                      </p>
                      <button
                        onClick={() => {
                          setVideoErrors((prev) => {
                            const copy = { ...prev };
                            delete copy[video.id];
                            return copy;
                          });
                          const el = videoRefs.current[video.id];
                          if (el) {
                            el.load();
                            el.play().catch(() => {});
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl font-bold"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        Réessayer
                      </button>
                    </div>
                  </div>
                )}

                {!isPlaying && !videoErrors[video.id] && (
                  <button
                    onClick={() => togglePlay(video.id)}
                    className="absolute inset-0 z-10 flex items-center justify-center"
                    aria-label="Lire la vidéo"
                  >
                    <span className="h-16 w-16 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">
                      <Play size={30} fill="white" className="ml-1" />
                    </span>
                  </button>
                )}

                {video.is_repost && (
                  <div className="absolute top-24 left-4 z-20 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-yellow-400/30 text-yellow-300 text-[10px] font-black flex items-center gap-1.5">
                    <Repeat2 size={12} />
                    REPOST
                  </div>
                )}

                <div className="absolute left-3 right-20 bottom-28 z-20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white bg-zinc-800 shrink-0">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg">
                          {profile.flag || "🌍"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm truncate">
                        @{profile.handle || "membre"} {profile.flag || ""}
                      </div>
                      <div className="text-[10px] text-white/50 truncate">
                        {profile.display_name || "Membre BAARO"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setExpandedCaption(captionOpen ? null : video.id)
                    }
                    className="text-left"
                  >
                    <p className={`text-sm font-medium leading-snug ${captionOpen ? "" : "line-clamp-2"}`}>
                      {caption || "Vidéo BAARO"}
                    </p>

                    {caption.length > 90 && (
                      <span className="text-[10px] text-white/50">
                        {captionOpen ? "Réduire" : "Plus"}
                      </span>
                    )}
                  </button>

                  <div className="mt-2">
                    <VideoTranslateControls
                      mediaUrl={video.media_url || video.video_url}
                      videoId={video.id}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/65 min-w-0">
                    <Music2 size={13} className="shrink-0" />
                    <span className="truncate">
                      {sound
                        ? `${sound.title}${sound.artist ? ` · ${sound.artist}` : ""}`
                        : "Son original"}
                    </span>
                  </div>
                </div>

                <div className="absolute right-2 bottom-28 z-30 flex flex-col items-center gap-3">
                  <button
                    onClick={() => handleLike(video.id)}
                    className="flex flex-col items-center"
                    aria-label="J'aime"
                  >
                    <span
                      className={`h-11 w-11 rounded-full backdrop-blur-md flex items-center justify-center ${
                        liked ? "bg-pink-500/25" : "bg-white/10"
                      }`}
                    >
                      <Heart
                        size={22}
                        className={liked ? "text-pink-500" : "text-white"}
                        fill={liked ? "currentColor" : "none"}
                      />
                    </span>
                    <span className="text-[10px] font-black mt-1">
                      {formatCount(video.likes)}
                    </span>
                  </button>

                  <button
                    onClick={() => openComments(video.id)}
                    className="flex flex-col items-center"
                    aria-label="Commentaires"
                  >
                    <span className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                      <MessageCircle size={21} />
                    </span>
                    <span className="text-[10px] font-black mt-1">
                      {formatCount(video.comments_count)}
                    </span>
                  </button>

                  <button
                    onClick={() => handleRepost(video)}
                    className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                    aria-label="Reposter"
                  >
                    <Repeat2 size={21} />
                  </button>

                  {video.author_id !== user?.id && <TipButton recipientId={video.author_id} compact />}

                  <button
                    onClick={() => handleShare(video)}
                    className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                    aria-label="Partager"
                  >
                    {shareId === video.id ? (
                      <Check size={21} className="text-green-400" />
                    ) : (
                      <Share2 size={21} />
                    )}
                  </button>

                  <button
                    onClick={() => toggleFullscreen(video.id)}
                    className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                    aria-label="Plein écran"
                  >
                    <Expand size={20} />
                  </button>

                  {video.author_id === user?.id && (
                    <button
                      onClick={() => handleDelete(video.id)}
                      className="h-11 w-11 rounded-full bg-red-500/20 backdrop-blur-md flex items-center justify-center"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={19} className="text-red-300" />
                    </button>
                  )}
                </div>

                <div className="absolute left-3 right-3 bottom-24 z-30 h-1 rounded-full bg-white/20 overflow-hidden pointer-events-none">
                  <div
                    className="h-full transition-[width] duration-100"
                    style={{
                      width: `${(progress[video.id] || 0) * 100}%`,
                      background: COLORS.gold,
                    }}
                  />
                </div>

                <div className="absolute bottom-8 left-3 right-3 z-30 flex items-center justify-between text-[10px] text-white/55">
                  <span className="flex items-center gap-1">
                    <Clock3 size={12} />
                    {video.duration || "00:00"}
                  </span>

                  <div className="flex items-center gap-2">
                    {video.author_id === user?.id && (
                      <>
                        <button type="button" onClick={() => setEngagement({ type: "videoViews", id: video.id })} className="text-[9px] text-white/70 hover:text-white">👁 noms</button>
                        <button type="button" onClick={() => setEngagement({ type: "videoLikes", id: video.id })} className="text-[9px] text-white/70 hover:text-white">❤️ noms</button>
                      </>
                    )}
                    <span>{formatCount(video.views)} vues</span>
                    <button
                      onClick={() => toggleMute()}
                      className="h-8 w-8 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center"
                    >
                      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {engagement && <EngagementList type={engagement.type} targetId={engagement.id} ownerId={user?.id} viewerId={user?.id} onClose={() => setEngagement(null)} />}

      {showComments && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full max-w-xl max-h-[78dvh] bg-zinc-950 rounded-t-3xl border border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div>
                <h3 className="font-black">Commentaires</h3>
                <p className="text-[10px] text-white/40">
                  {(comments[showComments] || []).length} commentaire(s)
                </p>
              </div>
              <button
                onClick={() => setShowComments(null)}
                className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(comments[showComments] || []).length === 0 ? (
                <div className="py-12 text-center text-white/40 text-sm">
                  Aucun commentaire. Sois le premier !
                </div>
              ) : (
                (comments[showComments] || []).map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <div className="h-8 w-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {comment.profiles?.avatar_url ? (
                        <img
                          src={comment.profiles.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs">
                          {comment.profiles?.flag || "🌍"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-black">
                        @{comment.profiles?.handle || "membre"}
                      </div>
                      <p className="text-sm text-white/75">{comment.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-white/10 flex gap-2">
              <input
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendComment();
                }}
                placeholder="Ajouter un commentaire…"
                className="flex-1 rounded-2xl bg-white/10 px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={sendComment}
                className="h-12 w-12 rounded-2xl flex items-center justify-center"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <VideoNextGenStudio
        open={nextGenOpen}
        onClose={() => setNextGenOpen(false)}
        onCreate={() => {
          setNextGenOpen(false);
          setShowUpload(true);
        }}
      />

      {showUpload && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          {cameraOpen && (
            <div className="fixed inset-0 z-[120] bg-black flex flex-col">
              <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <button
                  onClick={closeCamera}
                  className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center"
                  aria-label="Fermer la caméra"
                >
                  <X size={20} />
                </button>
                <div className="text-center">
                  <div className="font-black">Caméra BAARO</div>
                  <div className="text-xs text-white/50">
                    {formatTime(cameraSeconds)}
                  </div>
                </div>
                <button
                  onClick={toggleCameraFacing}
                  disabled={cameraRecording}
                  className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-40"
                  aria-label="Changer de caméra"
                >
                  🔄
                </button>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center px-3">
                <div className="relative w-full max-w-md h-full max-h-[78dvh] rounded-3xl overflow-hidden bg-zinc-950">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    style={{ transform: cameraFacing === "user" ? "scaleX(-1)" : "none" }}
                  />
                  {cameraError && (
                    <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/75 border border-red-400/30 p-4 text-sm text-center">
                      {cameraError}
                    </div>
                  )}
                  {cameraRecording && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-bold">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      REC · {formatTime(cameraSeconds)}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3">
                {!cameraError && (
                  <button
                    onClick={cameraRecording ? stopCameraRecording : startCameraRecording}
                    className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95"
                    aria-label={cameraRecording ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
                  >
                    <span
                      className={cameraRecording ? "h-8 w-8 rounded-lg bg-red-500" : "h-16 w-16 rounded-full bg-red-500"}
                    />
                  </button>
                )}
                {cameraError && (
                  <button
                    onClick={startCamera}
                    className="rounded-2xl px-5 py-3 font-black"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    Réessayer la caméra
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-white/10">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-zinc-950/95 backdrop-blur border-b border-white/10">
              <div>
                <h3 className="font-black text-lg">Nouvelle vidéo</h3>
                <p className="text-[10px] text-white/40">Publie ton contenu sur BAARO</p>
              </div>
              <button
                onClick={() => {
                  if (!uploading) {
                    closeCamera();
                    setShowUpload(false);
                    resetUpload();
                  }
                }}
                className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!selectedFile ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/5">
                    {[
                      ["video", "🎬 Vidéo"],
                      ["photo", "🖼️ Photos"],
                      ["text", "✍️ Texte"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setCreateMode(key)}
                        className={`py-2 rounded-xl text-xs font-bold ${
                          createMode === key ? "bg-white text-black" : "text-white/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {createMode === "video" && (
                <div className="space-y-3">
                  <button
                    onClick={openCamera}
                    className="w-full aspect-[9/14] max-h-[52dvh] rounded-3xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center active:scale-[0.99]"
                    style={{ boxShadow: `inset 0 0 0 1px ${COLORS.gold}33` }}
                  >
                    <div
                      className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
                      style={{ background: COLORS.gold, color: "#000" }}
                    >
                      <span className="text-3xl">📹</span>
                    </div>
                    <p className="font-black text-lg">Filmer avec la caméra</p>
                    <p className="text-xs text-white/40 mt-1 px-6 text-center">
                      Caméra + micro · aucune limite de durée imposée par BAARO
                    </p>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold"
                  >
                    <Plus size={18} />
                    Choisir une vidéo dans la galerie
                  </button>
                </div>
                  )}

                  {createMode === "mix" && (
                    <div className="space-y-3">
                      <input
                        ref={mixInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          handleMixSelected(event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => mixInputRef.current?.click()}
                        className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.04] py-8 flex flex-col items-center gap-2"
                      >
                        <Plus size={22} />
                        <span className="text-sm font-bold">Ajouter photos + vidéos ({mixAssets.length}/{MAX_PHOTOS})</span>
                        <span className="text-[10px] text-white/40">Une seule photo, plusieurs photos, une vidéo ou un mélange.</span>
                      </button>

                      {mixAssets.length > 0 && (
                        <div className="space-y-2">
                          {mixAssets.map((item, index) => (
                            <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-2">
                              <div className="h-14 w-14 rounded-xl overflow-hidden bg-black shrink-0">
                                {item.type === "image" ? (
                                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-black">{index + 1}. {item.type === "image" ? "Photo" : "Vidéo"}</div>
                                <div className="text-[10px] text-white/40">{item.type === "image" ? `${photoSeconds}s` : formatTime(item.duration)}</div>
                              </div>
                              <button onClick={() => removeMixAsset(item.id)} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea
                        value={textContent}
                        onChange={(event) => setTextContent(event.target.value)}
                        placeholder="Texte à afficher sur toute la création (facultatif)…"
                        rows={2}
                        maxLength={280}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
                      />

                      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm">
                        <span>Durée de chaque photo</span>
                        <select value={photoSeconds} onChange={(event) => setPhotoSeconds(Number(event.target.value))} className="bg-transparent outline-none font-bold">
                          {[2, 3, 5].map((n) => <option key={n} value={n} className="text-black">{n} s</option>)}
                        </select>
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={generating || !mixAssets.length}
                        className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        {generating ? `Création… ${Math.round(generateProgress * 100)}%` : "Créer le montage"}
                      </button>
                      <p className="text-[10px] text-white/40 text-center">Les photos et vidéos sont enchaînées dans l'ordre choisi. Le texte et la musique sont ajoutés au montage.</p>
                    </div>
                  )}

                  {createMode === "photo" && (
                    <div className="space-y-3">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          handlePhotosSelected(event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.04] py-8 flex flex-col items-center gap-2"
                      >
                        <Plus size={22} />
                        <span className="text-sm font-bold">
                          Ajouter des photos ({photoFiles.length}/{MAX_PHOTOS})
                        </span>
                      </button>

                      {photoFiles.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {photoFiles.map((item) => (
                            <div
                              key={item.id}
                              className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800"
                            >
                              <img src={item.url} alt="" className="h-full w-full object-cover" />
                              <button
                                onClick={() => removePhoto(item.id)}
                                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center"
                                aria-label="Retirer la photo"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm">
                        <span>Durée par photo</span>
                        <select
                          value={photoSeconds}
                          onChange={(event) => setPhotoSeconds(Number(event.target.value))}
                          className="bg-transparent outline-none font-bold"
                        >
                          {[2, 3, 5].map((n) => (
                            <option key={n} value={n} className="text-black">
                              {n} s
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={generating || !photoFiles.length}
                        className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        {generating
                          ? `Création… ${Math.round(generateProgress * 100)}%`
                          : "Créer la vidéo"}
                      </button>
                      <p className="text-[10px] text-white/40 text-center">
                        Choisis ta musique ci-dessous, puis crée. Reste sur cet écran pendant la création.
                      </p>
                    </div>
                  )}

                  {createMode === "text" && (
                    <div className="space-y-3">
                      <div
                        className="relative rounded-3xl overflow-hidden aspect-[9/14] max-h-[40dvh] mx-auto flex items-center justify-center p-6 text-center"
                        style={{
                          background: `linear-gradient(135deg, ${TEXT_THEMES[textTheme][0]}, ${TEXT_THEMES[textTheme][1]})`,
                        }}
                      >
                        <p className="font-black text-xl leading-tight break-words whitespace-pre-wrap">
                          {textContent.trim() || "Ton texte apparaîtra ici"}
                        </p>
                      </div>

                      <textarea
                        value={textContent}
                        onChange={(event) => setTextContent(event.target.value)}
                        placeholder="Écris ton message…"
                        rows={3}
                        maxLength={280}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
                      />

                      <div className="flex items-center gap-3">
                        {TEXT_THEMES.map(([c1, c2], index) => (
                          <button
                            key={index}
                            onClick={() => setTextTheme(index)}
                            className="h-9 w-9 rounded-full border-2"
                            style={{
                              background: `linear-gradient(135deg, ${c1}, ${c2})`,
                              borderColor: textTheme === index ? "#fff" : "transparent",
                            }}
                            aria-label={`Couleur ${index + 1}`}
                          />
                        ))}
                      </div>

                      <button
                        onClick={handleGenerate}
                        disabled={generating || !textContent.trim()}
                        className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
                        style={{ background: COLORS.gold, color: "#000" }}
                      >
                        {generating
                          ? `Création… ${Math.round(generateProgress * 100)}%`
                          : "Créer la vidéo"}
                      </button>
                      <p className="text-[10px] text-white/40 text-center">
                        Choisis ta musique ci-dessous, puis crée. Reste sur cet écran pendant la création.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/14] max-h-[52dvh]">
                  <video
                    ref={previewVideoRef}
                    src={previewUrl}
                    controls
                    playsInline
                    muted={muteOriginal && !!selectedSound?.audio_url && !bakedAudio}
                    className="h-full w-full object-contain"
                    onPlay={() => {
                      const a = previewAudioRef.current;
                      if (!a) return;
                      stopSoundPreview();
                      a.currentTime = previewVideoRef.current?.currentTime || 0;
                      a.play().catch(() => {});
                    }}
                    onPause={() => previewAudioRef.current?.pause()}
                    onEnded={() => previewAudioRef.current?.pause()}
                    onSeeked={() => {
                      const a = previewAudioRef.current;
                      if (a) a.currentTime = previewVideoRef.current?.currentTime || 0;
                    }}
                  />
                  {selectedSound?.audio_url && !bakedAudio && (
                    <audio
                      ref={previewAudioRef}
                      src={selectedSound.audio_url}
                      loop
                      preload="auto"
                    />
                  )}
                  <button
                    disabled={uploading}
                    onClick={() => {
                      if (generated) {
                        backToCreator();
                        return;
                      }
                      resetUpload();
                      fileInputRef.current?.click();
                    }}
                    className="absolute top-3 right-3 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md text-xs font-bold"
                  >
                    {generated ? "Modifier" : "Changer"}
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => handleFileSelected(event.target.files?.[0])}
              />

              <input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Titre de la vidéo"
                maxLength={120}
                className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm"
              />

              <textarea
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                placeholder="Description…"
                rows={3}
                maxLength={500}
                className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
              />

              <button
                onClick={() => {
                  stopSoundPreview();
                  setShowSoundPicker((value) => !value);
                }}
                className="w-full flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm min-w-0">
                  <Music2 size={17} className="shrink-0" />
                  <span className="truncate">
                    {selectedSound?.title || selectedSound?.name || "Ajouter un son"}
                  </span>
                </span>
                <ChevronDown
                  size={17}
                  className={showSoundPicker ? "rotate-180 transition" : "transition"}
                />
              </button>

              <input
                ref={soundFileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  handleSoundFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />

              {selectedSound?.license_name && !showSoundPicker && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-3 py-2 text-[11px] text-emerald-200">
                  {selectedSound.license_name}{selectedSound.attribution_required ? " • attribution requise" : " • utilisation autorisée"}
                  {selectedSound.rights_holder ? ` • ${selectedSound.rights_holder}` : ""}
                </div>
              )}

              {showSoundPicker && (
                <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                  <button
                    onClick={() => soundFileInputRef.current?.click()}
                    className="w-full px-4 py-3 text-left text-sm font-bold border-b border-white/10"
                    style={{ color: COLORS.gold }}
                  >
                    🎵 Importer mon audio
                  </button>
                  <button
                    onClick={() => chooseSound(null)}
                    className="w-full px-4 py-3 text-left text-sm border-b border-white/10"
                  >
                    Aucun son (son d'origine)
                  </button>
                  <div className="max-h-56 overflow-y-auto">
                    {sounds.length === 0 && (
                      <p className="px-4 py-4 text-xs text-white/40">
                        Aucun son dans la bibliothèque. Importe ton propre audio ci-dessus.
                      </p>
                    )}
                    {sounds.map((item) => {
                      const key = String(item.id);
                      const isPreviewing = previewingSoundId === key;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 px-2 border-b border-white/5 last:border-0"
                        >
                          <button
                            onClick={() => toggleSoundPreview(item)}
                            className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center"
                            aria-label={isPreviewing ? "Arrêter l'écoute" : "Écouter"}
                          >
                            {isPreviewing ? <Pause size={15} /> : <Play size={15} />}
                          </button>
                          <button
                            onClick={() => chooseSound(item)}
                            className="flex-1 min-w-0 py-3 text-left text-sm"
                          >
                            <div className="font-bold truncate">
                              {item.title || item.name || "Son BAARO"}
                            </div>
                            <div className="text-[10px] text-white/40 truncate">
                              {item.artist || "Audio BAARO"}
                            </div>
                            <div className="text-[10px] text-emerald-300/80 truncate">
                              {item.license_name || "Licence BAARO"}{item.attribution_required ? " • attribution requise" : ""}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedFile && selectedSound?.audio_url && !bakedAudio && (
                <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
                  <span>Couper le son d'origine de la vidéo</span>
                  <input
                    type="checkbox"
                    checked={muteOriginal}
                    onChange={(event) => setMuteOriginal(event.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              )}

              {uploading && (
                <div>
                  <div className="flex justify-between text-xs mb-2">
                    <span>Publication…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${uploadProgress}%`,
                        background: COLORS.gold,
                      }}
                    />
                  </div>
                </div>
              )}

              <button
                disabled={uploading || !selectedFile}
                onClick={handleUpload}
                className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                {uploading ? "Publication en cours…" : "Publier la vidéo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default VideosTab;
