import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";

// Lecture du flux : vidéo visible, son, progression, plein écran.
export function useFeedPlayback({ visibleVideos }) {
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState({});
  const [videoErrors, setVideoErrors] = useState({});

  const videoRefs = useRef({});
  const audioRefs = useRef({});
  const mutedRef = useRef(true);
  const viewedRef = useRef(new Set());

  useEffect(() => {
    if (!visibleVideos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.7,
          )
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
      { threshold: [0.7, 0.85, 1] },
    );

    Object.values(videoRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleVideos]);

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

  return {
    videoRefs,
    audioRefs,
    playingId,
    setPlayingId,
    muted,
    progress,
    videoErrors,
    setVideoErrors,
    syncAudioTime,
    playAudioFor,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    handleTimeUpdate,
  };
}
