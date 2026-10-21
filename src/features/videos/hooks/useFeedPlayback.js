import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";

// Lecture du flux : vidéo visible, son, progression, gestion éco-données et arrêt automatique.
export function useFeedPlayback({ visibleVideos }) {
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState({});
  const [videoErrors, setVideoErrors] = useState({});
  const videoRefs = useRef({});
  const audioRefs = useRef({});
  const mutedRef = useRef(true);
  const playingIdRef = useRef(null);
  playingIdRef.current = playingId;
  const viewedRef = useRef(new Set());

  useEffect(() => {
    if (!visibleVideos.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        const id = video.dataset.id;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) {
          video.pause();
          if (video.src) {
            video.dataset.savedSrc = video.src;
            video.removeAttribute("src");
            video.load();
          }
          if (playingIdRef.current === id) setPlayingId(null);
        }
      });

      const visible = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;

      const video = visible.target;
      const id = video.dataset.id;
      if (!video.src && video.dataset.savedSrc) {
        video.src = video.dataset.savedSrc;
        video.load();
      }
      setPlayingId(id);
      if (id && !viewedRef.current.has(id)) {
        viewedRef.current.add(id);
        supabase.rpc("register_video_view", { p_video_id: id }).then(({ error }) => {
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
    }, { threshold: [0.3, 0.6, 0.9] });

    Object.values(videoRefs.current).forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [visibleVideos]);

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
    setPlayingId((current) => String(current) === key ? null : current);
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
  };
}
