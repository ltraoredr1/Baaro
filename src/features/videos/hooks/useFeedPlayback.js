import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";

// Lecture du flux : état (son, progression, erreurs) et actions sur les éléments.
// IMPORTANT : ce hook ne décide JAMAIS quelle vidéo joue. Le seul observateur
// (IntersectionObserver de VideosTab) choisit la vidéo active et lance/coupe la lecture.
export function useFeedPlayback({ visibleVideos } = {}) { // eslint-disable-line no-unused-vars
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(() => {
    try {
      const saved = localStorage.getItem("baaro:video-muted");
      if (saved === "false") return false;
      if (saved === "true") return true;
    } catch {}
    return false; // son activé par défaut
  });
  const [progress, setProgress] = useState({});
  const [videoErrors, setVideoErrors] = useState({});
  const videoRefs = useRef({});
  const audioRefs = useRef({});
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const playingIdRef = useRef(null);
  playingIdRef.current = playingId;
  const viewedRef = useRef(new Set());

  // Enregistre une vue, une seule fois par vidéo. Appelée par le gestionnaire central.
  const registerView = (id) => {
    if (id == null) return;
    const key = String(id);
    if (viewedRef.current.has(key)) return;
    viewedRef.current.add(key);
    supabase.rpc("register_video_view", { p_video_id: key }).then(({ error }) => {
      if (error) console.debug("view registration:", error.message);
    });
  };

  const syncAudioTime = (videoEl, audio) => {
    if (!videoEl || !audio) return;
    let time = videoEl.currentTime || 0;
    if (Number.isFinite(audio.duration) && audio.duration > 0) time %= audio.duration;
    if (Math.abs((audio.currentTime || 0) - time) > 0.4) {
      try { audio.currentTime = time; } catch { /* métadonnées indisponibles */ }
    }
  };

  const playAudioFor = (id, videoEl) => {
    const audio = audioRefs.current[String(id)];
    if (!audio) return;
    audio.muted = mutedRef.current;
    syncAudioTime(videoEl, audio);
    if (!mutedRef.current) audio.play().catch(() => {});
  };

  const pause = (id) => {
    if (id == null) return;
    const key = String(id);
    const video = videoRefs.current[key];
    if (!video) return;
    video.pause();
    audioRefs.current[key]?.pause();
    setPlayingId((current) => (String(current) === key ? null : current));
  };

  const resume = (id) => {
    if (id == null) return;
    const key = String(id);
    const video = videoRefs.current[key];
    if (!video) return;
    video.play().then(() => {
      setPlayingId(key);
      playAudioFor(key, video);
    }).catch(() => {});
  };

  const togglePlay = (id) => {
    if (id == null) return;
    const video = videoRefs.current[String(id)];
    if (!video) return;
    if (video.paused) resume(id);
    else pause(id);
  };

  const setMutedExplicit = (nextMuted) => {
    const next = Boolean(nextMuted);
    mutedRef.current = next;
    setMuted(next);
    try {
      localStorage.setItem("baaro:video-muted", String(next));
    } catch {}
    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (video) video.muted = next || video.dataset.muteOriginal === "1";
      const audio = audioRefs.current[id];
      if (audio) {
        audio.muted = next;
        if (next) audio.pause();
      }
    });
    if (!next && playingIdRef.current != null) {
      const key = String(playingIdRef.current);
      const video = videoRefs.current[key];
      if (video && !video.paused) playAudioFor(key, video);
    }
  };

  const toggleMute = () => setMutedExplicit(!mutedRef.current);

  const toggleFullscreen = async (id) => {
    const video = videoRefs.current[String(id)];
    if (!video) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (video.requestFullscreen) await video.requestFullscreen();
    } catch { /* Plein écran bloqué par le navigateur */ }
  };

  const handleTimeUpdate = (id, event) => {
    const video = event.currentTarget;
    setProgress((prev) => ({ ...prev, [id]: video.duration ? video.currentTime / video.duration : 0 }));
    const audio = audioRefs.current[id];
    if (audio && !video.paused) syncAudioTime(video, audio);
  };

  return {
    videoRefs, audioRefs, playingId, setPlayingId, muted, setMutedExplicit,
    progress, videoErrors, setVideoErrors, syncAudioTime, playAudioFor,
    pause, resume, togglePlay, toggleMute, toggleFullscreen, handleTimeUpdate,
    registerView,
  };
}
