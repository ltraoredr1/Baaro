import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Expand,
  Heart,
  MessageCircle,
  Music2,
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
  const [creatorMode, setCreatorMode] = useState(null); // camera | gallery
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState("");
  const [localAudioFile, setLocalAudioFile] = useState(null);
  const [localAudioUrl, setLocalAudioUrl] = useState("");
  const [sourceVideoId, setSourceVideoId] = useState(null);
  const [sourceSound, setSourceSound] = useState(null);
  const cameraVideoRef = useRef(null);
  const cameraRecorderRef = useRef(null);
  const cameraChunksRef = useRef([]);
  const localAudioInputRef = useRef(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null);
  const [videoVolume, setVideoVolume] = useState(1);
  const [audioVolume, setAudioVolume] = useState(1);
  const [audioOffset, setAudioOffset] = useState(0);
  const [editorDuration, setEditorDuration] = useState(0);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const editorVideoRef = useRef(null);
  const editorAudioRef = useRef(null);

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
          duration_seconds,
          views,
          likes,
          comments_count,
          is_repost,
          created_at,
          author_id,
          sound_id,
          original_sound_id,
          repost_of_id,
          watch_seconds,
          tips_total,
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
          duration: video.duration || null,
          duration_seconds: Number(video.duration_seconds || 0) || null,
          views: 0,
          likes: 0,
          comments_count: 0,
          is_repost: true,
          repost_of_id: video.repost_of_id || video.id,
          original_author_id: video.original_author_id || video.author_id,
          sound_id: video.sound_id || null,
          original_sound_id: video.original_sound_id || video.sound_id || null,
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

  const stopCamera = useCallback(() => {
    if (cameraRecorderRef.current?.state === "recording") {
      cameraRecorderRef.current.stop();
    }
    cameraRecorderRef.current = null;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setCameraRecording(false);
  }, [cameraStream]);

  const openCameraCreator = async (sound = null, sourceId = null) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("La caméra n'est pas disponible dans ce navigateur/appareil.", "error");
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing },
        audio: true,
      });
      setCameraStream(stream);
      setSourceSound(sound);
      setSourceVideoId(sourceId);
      setCreatorMode("camera");
      requestAnimationFrame(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        }
      });
    } catch (error) {
      console.error(error);
      showToast("Autorise l'accès à la caméra et au micro pour filmer.", "error");
    }
  };

  const flipCamera = async () => {
    if (!cameraStream) return;
    const next = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(next);

    try {
      cameraStream.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
        audio: true,
      });
      setCameraStream(stream);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
    } catch (error) {
      console.error(error);
      showToast("Impossible de changer de caméra.", "error");
    }
  };

  const startCameraRecording = () => {
    if (!cameraStream) return;

    const preferred =
      MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "";

    const recorder = new MediaRecorder(
      cameraStream,
      preferred ? { mimeType: preferred } : undefined
    );

    cameraChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) cameraChunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(cameraChunksRef.current, {
        type: recorder.mimeType || "video/webm",
      });
      const file = new File(
        [blob],
        `baaro-camera-${Date.now()}.webm`,
        { type: blob.type }
      );

      if (cameraPreviewUrl) URL.revokeObjectURL(cameraPreviewUrl);
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setPreviewUrl(url);
      setCameraPreviewUrl(url);
      setCameraRecording(false);
      stopCamera();
      setCreatorMode(null);
    };

    cameraRecorderRef.current = recorder;
    recorder.start();
    setCameraRecording(true);
  };

  const stopCameraRecording = () => {
    if (cameraRecorderRef.current?.state === "recording") {
      cameraRecorderRef.current.stop();
    }
  };

  const handleLocalAudio = (file) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      showToast("Sélectionne un fichier audio.", "error");
      return;
    }

    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    setLocalAudioFile(file);
    setLocalAudioUrl(URL.createObjectURL(file));
  };

  const useVideoSound = (video) => {
    const sound = sounds.find((item) => item.id === video.sound_id) || {
      id: video.sound_id || video.original_sound_id,
      title: "Son de cette vidéo",
      artist: video.profiles?.handle ? `@${video.profiles.handle}` : "BAARO",
    };

    setSelectedSound(sound);
    setSourceSound(sound);
    setSourceVideoId(video.id);
    setShowUpload(true);
    showToast("Son sélectionné. Crée ta vidéo avec ce son.", "success");
  };


  const syncEditorMedia = () => {
    const video = editorVideoRef.current;
    const audio = editorAudioRef.current;
    if (!video) return;

    video.volume = videoVolume;
    if (audio) {
      audio.volume = audioVolume;
      audio.currentTime = Math.max(0, Number(audioOffset) || 0);
    }
  };

  const seekEditor = (value) => {
    const video = editorVideoRef.current;
    if (!video) return;
    video.currentTime = Number(value) || 0;
    if (editorAudioRef.current) {
      editorAudioRef.current.currentTime =
        Math.max(0, (Number(value) || 0) - (Number(audioOffset) || 0));
    }
  };

  const handleEditorMetadata = () => {
    const duration = editorVideoRef.current?.duration || 0;
    setEditorDuration(duration);
    setTrimEnd((current) => current == null ? duration : Math.min(current, duration));
  };

  const exportEditedVideo = async () => {
    const video = editorVideoRef.current;
    if (!video || !selectedFile) return;

    // Browser-native export path. For long videos, this uses MediaRecorder
    // and does not impose a BAARO duration limit. Availability depends on
    // the browser codec support.
    if (!video.captureStream || typeof MediaRecorder === "undefined") {
      showToast("L'export direct n'est pas pris en charge par ce navigateur. La vidéo originale reste disponible.", "error");
      return;
    }

    const end = trimEnd == null ? editorDuration : Math.min(trimEnd, editorDuration);
    const start = Math.max(0, Number(trimStart) || 0);
    if (end > 0 && end <= start) {
      showToast("La fin doit être après le début.", "error");
      return;
    }

    setIsRenderingPreview(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;

      const ctx = canvas.getContext("2d", { alpha: false });
      const videoStream = canvas.captureStream(30);

      // Capture the selected video's audio when supported.
      let audioContext = null;
      let destination = null;
      const tracks = [...videoStream.getVideoTracks()];

      if (window.AudioContext || window.webkitAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
        destination = audioContext.createMediaStreamDestination();

        const videoAudio = audioContext.createMediaElementSource(video);
        const videoGain = audioContext.createGain();
        videoGain.gain.value = Number(videoVolume);
        videoAudio.connect(videoGain).connect(destination);

        if (editorAudioRef.current) {
          const localAudio = audioContext.createMediaElementSource(editorAudioRef.current);
          const localGain = audioContext.createGain();
          localGain.gain.value = Number(audioVolume);
          localAudio.connect(localGain).connect(destination);
        }

        tracks.push(...destination.stream.getAudioTracks());
      }

      const outputStream = new MediaStream(tracks);
      const mime =
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "";

      if (!mime) {
        throw new Error("MediaRecorder video codec unavailable");
      }

      const recorder = new MediaRecorder(outputStream, { mimeType: mime });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };

      const done = new Promise((resolve, reject) => {
        recorder.onerror = () => reject(recorder.error || new Error("Export failed"));
        recorder.onstop = resolve;
      });

      video.currentTime = start;
      await video.play();
      if (editorAudioRef.current) {
        editorAudioRef.current.currentTime = Math.max(0, start - Number(audioOffset || 0));
        editorAudioRef.current.play().catch(() => {});
      }

      recorder.start(1000);

      const draw = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const current = video.currentTime;
        if (end > 0 && current >= end) {
          video.pause();
          if (editorAudioRef.current) editorAudioRef.current.pause();
          recorder.stop();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();

      await done;

      const blob = new Blob(chunks, { type: mime });
      const file = new File(
        [blob],
        `baaro-edit-${Date.now()}.webm`,
        { type: mime }
      );

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setPreviewUrl(url);
      setCameraPreviewUrl(url);

      showToast("Montage exporté. Tu peux maintenant publier.", "success");
      if (audioContext) await audioContext.close();
    } catch (error) {
      console.error(error);
      showToast("Le montage n'a pas pu être exporté sur cet appareil.", "error");
    } finally {
      setIsRenderingPreview(false);
    }
  };

  const resetUpload = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setUploadTitle("");
    setUploadDescription("");
    setSelectedSound(null);
    setSourceSound(null);
    setSourceVideoId(null);
    setLocalAudioFile(null);
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    setLocalAudioUrl("");
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
      const durationSeconds = await new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(selectedFile);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          const value = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0;
          URL.revokeObjectURL(objectUrl);
          resolve(value);
        };
        probe.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(0);
        };
        probe.src = objectUrl;
      });
      setUploadProgress(80);

      const { data: created, error: dbError } = await supabase
        .from("videos")
        .insert({
          author_id: user.id,
          video_url: publicData.publicUrl,
          title: uploadTitle.trim() || "Vidéo BAARO",
          description: uploadDescription.trim() || null,
          duration,
          duration_seconds: durationSeconds || null,
          views: 0,
          likes: 0,
          comments_count: 0,
          watch_seconds: 0,
          tips_total: 0,
          sound_id: selectedSound?.id || null,
          original_sound_id: selectedSound?.id || null,
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
                    onClick={() => useVideoSound(video)}
                    className="h-11 w-11 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
                    aria-label="Utiliser ce son"
                  >
                    <Music2 size={20} />
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

      {creatorMode === "camera" && (
        <div className="fixed inset-0 z-[95] bg-black flex flex-col">
          <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
            <button
              onClick={() => { stopCamera(); setCreatorMode(null); }}
              className="h-10 w-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"
            >
              <X size={20} />
            </button>
            <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur text-xs font-black">
              {cameraRecording ? "● ENREGISTREMENT" : "CAMÉRA BAARO"}
            </div>
            <button
              onClick={flipCamera}
              className="h-10 w-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"
            >
              🔄
            </button>
          </div>

          <video
            ref={cameraVideoRef}
            muted
            playsInline
            autoPlay
            className="flex-1 w-full h-full object-cover"
          />

          <div className="absolute bottom-0 left-0 right-0 z-10 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => { stopCamera(); setCreatorMode(null); }}
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center"
              >
                <X size={20} />
              </button>

              <button
                onClick={cameraRecording ? stopCameraRecording : startCameraRecording}
                className={`h-20 w-20 rounded-full border-4 border-white flex items-center justify-center ${cameraRecording ? "bg-red-500" : "bg-white"}`}
                aria-label={cameraRecording ? "Arrêter" : "Enregistrer"}
              >
                {cameraRecording ? (
                  <span className="h-7 w-7 rounded-md bg-white" />
                ) : (
                  <span className="h-14 w-14 rounded-full bg-red-500" />
                )}
              </button>

              <button
                onClick={() => {
                  stopCamera();
                  setCreatorMode(null);
                  setShowUpload(true);
                }}
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-xs font-black"
              >
                OK
              </button>
            </div>
            <p className="text-center text-[10px] text-white/45 mt-4">
              Aucun plafond de durée imposé par BAARO
            </p>
          </div>
        </div>
      )}

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
          <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-white/10">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-zinc-950/95 backdrop-blur border-b border-white/10">
              <div>
                <h3 className="font-black text-lg">Nouvelle vidéo</h3>
                <p className="text-[10px] text-white/40">Publie ton contenu sur BAARO</p>
              </div>
              <button
                onClick={() => {
                  if (!uploading) {
                    stopCamera();
                    setCreatorMode(null);
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
  
              {selectedFile && (
                <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase text-white/40">Montage vidéo</div>
                      <div className="font-black mt-1">Vidéo + audio + découpage</div>
                    </div>
                    {isRenderingPreview && (
                      <div className="text-xs text-yellow-300 font-bold">Export…</div>
                    )}
                  </div>

                  <video
                    ref={editorVideoRef}
                    src={previewUrl || URL.createObjectURL(selectedFile)}
                    playsInline
                    controls
                    onLoadedMetadata={handleEditorMetadata}
                    onVolumeChange={syncEditorMedia}
                    className="w-full rounded-2xl bg-black aspect-video object-contain"
                  />

                  {localAudioUrl && (
                    <audio
                      ref={editorAudioRef}
                      src={localAudioUrl}
                      preload="metadata"
                      className="hidden"
                    />
                  )}

                  {sourceSound && !localAudioUrl && (
                    <div className="rounded-2xl bg-yellow-400/10 border border-yellow-400/20 px-3 py-2 text-xs">
                      🎵 <b>{sourceSound.title || "Son BAARO"}</b>
                      <span className="text-white/40"> · son sélectionné</span>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-[10px] text-white/40 mb-2">
                      <span>Début {Number(trimStart).toFixed(1)}s</span>
                      <span>Fin {Number(trimEnd ?? editorDuration).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(editorDuration, 0.1)}
                      step="0.1"
                      value={Math.min(trimStart, Math.max(editorDuration - 0.1, 0))}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setTrimStart(value);
                        seekEditor(value);
                      }}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min="0"
                      max={Math.max(editorDuration, 0.1)}
                      step="0.1"
                      value={Math.min(trimEnd ?? editorDuration, editorDuration)}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full mt-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs">
                      <span className="text-white/40">Volume vidéo</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={videoVolume}
                        onChange={(e) => {
                          setVideoVolume(Number(e.target.value));
                          if (editorVideoRef.current) editorVideoRef.current.volume = Number(e.target.value);
                        }}
                        className="w-full"
                      />
                    </label>

                    <label className="text-xs">
                      <span className="text-white/40">Volume audio</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioVolume}
                        onChange={(e) => {
                          setAudioVolume(Number(e.target.value));
                          if (editorAudioRef.current) editorAudioRef.current.volume = Number(e.target.value);
                        }}
                        className="w-full"
                      />
                    </label>
                  </div>

                  <label className="block text-xs">
                    <span className="text-white/40">Décalage du son (secondes)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={audioOffset}
                      onChange={(e) => setAudioOffset(Number(e.target.value) || 0)}
                      className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 outline-none"
                    />
                  </label>

                  <button
                    onClick={exportEditedVideo}
                    disabled={isRenderingPreview}
                    className="w-full rounded-2xl py-3 font-black disabled:opacity-50"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    {isRenderingPreview ? "Export du montage…" : "🎬 Appliquer le montage"}
                  </button>

                  <p className="text-[10px] text-white/35">
                    BAARO n'impose aucune durée maximale. L'appareil et le navigateur peuvent toutefois avoir leurs propres limites techniques d'export.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                  <button
                    onClick={() => openCameraCreator(sourceSound, sourceVideoId)}
                    className="w-full rounded-3xl bg-white/10 border border-white/10 px-5 py-5 text-left flex items-center gap-4"
                  >
                    <span className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: COLORS.gold, color: "#000" }}>
                      <Plus size={24} />
                    </span>
                    <span>
                      <span className="block font-black">📹 Filmer avec la caméra</span>
                      <span className="block text-xs text-white/40 mt-1">Caméra + micro, sans limite de durée imposée par BAARO</span>
                    </span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-3xl bg-white/10 border border-white/10 px-5 py-5 text-left flex items-center gap-4"
                  >
                    <span className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">🎬</span>
                    <span>
                      <span className="block font-black">📱 Choisir une vidéo</span>
                      <span className="block text-xs text-white/40 mt-1">Galerie ou fichier vidéo local</span>
                    </span>
                  </button>

                  <button
                    onClick={() => localAudioInputRef.current?.click()}
                    className="w-full rounded-3xl bg-white/10 border border-white/10 px-5 py-5 text-left flex items-center gap-4"
                  >
                    <span className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center"><Music2 size={22} /></span>
                    <span>
                      <span className="block font-black">🎵 Ajouter un son local</span>
                      <span className="block text-xs text-white/40 mt-1">Utilise un fichier audio du téléphone</span>
                    </span>
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
                ref={localAudioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => handleLocalAudio(event.target.files?.[0])}
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

              {sourceSound && (
                <div className="rounded-2xl bg-yellow-400/10 border border-yellow-400/20 px-4 py-3">
                  <div className="text-[10px] text-yellow-300 font-black uppercase">Son de la vidéo</div>
                  <div className="font-bold text-sm mt-1">{sourceSound.title || "Son BAARO"}</div>
                  <div className="text-[10px] text-white/40">{sourceSound.artist || "Audio BAARO"}</div>
                </div>
              )}

              {localAudioFile && (
                <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-white/40 font-black uppercase">Son local</div>
                      <div className="font-bold text-sm mt-1 truncate max-w-[250px]">{localAudioFile.name}</div>
                    </div>
                    <button onClick={() => { setLocalAudioFile(null); if (localAudioUrl) URL.revokeObjectURL(localAudioUrl); setLocalAudioUrl(""); }} className="text-xs text-red-300">Retirer</button>
                  </div>
                  {localAudioUrl && <audio className="w-full mt-3" controls src={localAudioUrl} />}
                </div>
              )}

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
