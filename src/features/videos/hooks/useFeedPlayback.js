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
  // Valeur courante de playingId, lisible dans l'observer sans le recréer
  const playingIdRef = useRef(null);
  playingIdRef.current = playingId;
  const viewedRef = useRef(new Set());

  useEffect(() => {
    if (!visibleVideos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          const id = video.dataset.id;

          // Si la vidéo n'est plus suffisamment visible, on la met en pause et on coupe son src pour économiser la data
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) {
            video.pause();
            if (video.src) {
              video.dataset.savedSrc = video.src;
              video.removeAttribute("src");
              video.load();
            }
            if (playingIdRef.current === id) {
              setPlayingId(null);
            }
          }
        });

        // Trouver la vidéo la plus visible à l'écran
        const visible = entries
          .filter(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6,
          )
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        const video = visible.target;
        const id = video.dataset.id;

        // Restaurer le src si nécessaire
        if (!video.src && video.dataset.savedSrc) {
          video.src = video.dataset.savedSrc;
          video.load();
        }

        setPlayingId(id);

        // Compteur de vues unique
        if (id && !viewedRef.current.has(id)) {
          viewedRef.current.add(id);
          supabase
            .rpc("register_video_view", { p_video_id: id })
            .then(({ error }) => {
              if (error) console.debug("view registration:", error.message);
            });
        }

        // Gestion de l'autoplay sécurisé (forcé en muted si requis par le navigateur)
        video.muted = mutedRef.current || video.dataset.muteOriginal === "1";
        video.play().catch(() => {
          video.muted = true;
          mutedRef.current = true;
          setMuted(true);
          video.play().catch(() => {});
        });
      },
      { threshold: [0.3, 0.6, 0.9] },
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
      // Plein écran bloqué par le navigateur
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
