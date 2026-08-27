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
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "../../supabaseClient.js";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
      const { data, error } = await supabase
        .from("videos")
        .select(`
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
          sound_id,
          profiles:author_id (
            display_name,
            handle,
            flag,
            avatar_url
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

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

    supabase
      .from("sounds")
      .select("*")
      .order("usage_count", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (active) setSounds(data || []);
      });

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

        video.muted = muted;
        video.play().catch(() => {
          video.muted = true;
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
  }, [visibleVideos, muted]);

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
    setMuted(next);
    Object.values(videoRefs.current).forEach((video) => {
      if (video) video.muted = next;
    });
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
      const { data, error } = await supabase
        .from("videos")
        .insert({
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
        })
        .select("id")
        .single();

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
      const type = recorder.mimeType || mimeType || "video/webm";
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

  const resetUpload = () => {
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
    if (!file.type.startsWith("video/")) {
      showToast("Sélectionne un fichier vidéo.", "error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
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
      const ext = (selectedFile.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(path, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;
      setUploadProgress(65);

      const { data: publicData } = supabase.storage
        .from("videos")
        .getPublicUrl(path);

      const duration = await readDuration(selectedFile);
      setUploadProgress(80);

      const { data: created, error: dbError } = await supabase
        .from("videos")
        .insert({
          author_id: user.id,
          video_url: publicData.publicUrl,
          title: uploadTitle.trim() || "Vidéo BAARO",
          description: uploadDescription.trim() || null,
          duration,
          views: 0,
          likes: 0,
          sound_id: selectedSound?.id || null,
        })
        .select("id")
        .single();

      if (dbError) throw dbError;

      setUploadProgress(100);
      onRewardPoints?.("publish_video", "Vidéo publiée", created?.id);
      showPointsReward?.(25, "Vidéo publiée");
      showToast("Vidéo publiée avec succès 🎉", "success");

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
                  muted={muted}
                  preload="metadata"
                  onPlay={() => setPlayingId(id)}
                  onPause={() =>
                    setPlayingId((current) => (current === id ? null : current))
                  }
                  onTimeUpdate={(event) => handleTimeUpdate(video.id, event)}
                  onError={() =>
                    setVideoErrors((prev) => ({ ...prev, [video.id]: true }))
                  }
                  onClick={() => togglePlay(video.id)}
                />

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

                  {video.sound_id && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/65">
                      <Music2 size={13} />
                      <span>Son original / audio BAARO</span>
                    </div>
                  )}
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
              ) : (
                <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/14] max-h-[52dvh]">
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                  <button
                    disabled={uploading}
                    onClick={() => {
                      resetUpload();
                      fileInputRef.current?.click();
                    }}
                    className="absolute top-3 right-3 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md text-xs font-bold"
                  >
                    Changer
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
                onClick={() => setShowSoundPicker((value) => !value)}
                className="w-full flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Music2 size={17} />
                  {selectedSound?.title || selectedSound?.name || "Ajouter un son"}
                </span>
                <ChevronDown
                  size={17}
                  className={showSoundPicker ? "rotate-180 transition" : "transition"}
                />
              </button>

              {showSoundPicker && (
                <div className="rounded-2xl bg-white/5 border border-white/10 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedSound(null);
                      setShowSoundPicker(false);
                    }}
                    className="w-full px-4 py-3 text-left text-sm border-b border-white/10"
                  >
                    Aucun son
                  </button>
                  {sounds.map((sound) => (
                    <button
                      key={sound.id}
                      onClick={() => {
                        setSelectedSound(sound);
                        setShowSoundPicker(false);
                      }}
                      className="w-full px-4 py-3 text-left text-sm border-b border-white/5 last:border-0"
                    >
                      <div className="font-bold">{sound.title || sound.name || "Son BAARO"}</div>
                      <div className="text-[10px] text-white/40">
                        {sound.artist || "Audio BAARO"}
                      </div>
                    </button>
                  ))}
                </div>
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
