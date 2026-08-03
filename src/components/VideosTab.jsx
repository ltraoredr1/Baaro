import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  Play, Heart, MessageCircle, Share2, Coins, Volume2, VolumeX,
  Music, X, Plus, Repeat2, Check, Send
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { StoriesBar } from "./StoriesBar.jsx";
import { StoryViewer } from "./StoryViewer.jsx";

export function VideosTab({ onRewardPoints, userId }) {
  const { showToast, showPointsReward } = useToast();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [likedMap, setLikedMap] = useState({});
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [shareFeedbackId, setShareFeedbackId] = useState(null);
  const [commentOpen, setCommentOpen] = useState(null);
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState("");
  const [selectedSound, setSelectedSound] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [storyGroup, setStoryGroup] = useState(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [storyFile, setStoryFile] = useState(null);
  const [storyText, setStoryText] = useState("");
  const [uploadingStory, setUploadingStory] = useState(false);

  const videoRefs = useRef({});
  const observerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    supabase
      .from("sounds")
      .select("*")
      .order("usage_count", { ascending: false })
      .limit(40)
      .then(({ data }) => setSounds(data || []));
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("videos")
        .select(`
          id, title, description, video_url, thumbnail_url, duration,
          views, likes, comments_count, is_repost, created_at, author_id, sound_id,
          profiles:author_id (display_name, handle, flag, avatar_url)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setVideos(data || []);

      if (user?.id) {
        const { data: myLikes } = await supabase
          .from("video_likes")
          .select("video_id")
          .eq("user_id", user.id);
        const map = {};
        (myLikes || []).forEach((l) => (map[l.video_id] = true));
        setLikedMap(map);
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur chargement vidéos", "error");
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    if (videos.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoEl = entry.target;
          const videoId = videoEl.dataset.id;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            setPlayingId(videoId);
            videoEl.play().catch(() => {
              videoEl.muted = true;
              setMuted(true);
              videoEl.play().catch(() => {});
            });
          } else {
            videoEl.pause();
          }
        });
      },
      { threshold: 0.65 }
    );

    Object.values(videoRefs.current).forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [videos]);

  const handleLike = async (videoId) => {
    if (!user) return showToast("Connecte-toi pour aimer", "error");
    const isLiked = !!likedMap[videoId];
    setLikedMap((prev) => ({ ...prev, [videoId]: !isLiked }));
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? { ...v, likes: Math.max(0, (v.likes || 0) + (isLiked ? -1 : 1)) }
          : v
      )
    );
    try {
      if (isLiked) {
        await supabase.from("video_likes").delete().eq("video_id", videoId).eq("user_id", user.id);
      } else {
        await supabase.from("video_likes").insert({ video_id: videoId, user_id: user.id });
        onRewardPoints?.(3);
        showPointsReward?.(3, "Vidéo aimée");
      }
    } catch {
      setLikedMap((prev) => ({ ...prev, [videoId]: isLiked }));
      showToast("Erreur like", "error");
    }
  };

  const openComments = async (videoId) => {
    setCommentOpen(videoId);
    const { data } = await supabase
      .from("video_comments")
      .select(`id, text, created_at, profiles:author_id (display_name, handle, flag)`)
      .eq("video_id", videoId)
      .order("created_at", { ascending: true });
    setComments((prev) => ({ ...prev, [videoId]: data || [] }));
  };

  const sendComment = async () => {
    if (!newComment.trim() || !user || !commentOpen) return;
    try {
      await supabase.from("video_comments").insert({
        video_id: commentOpen,
        author_id: user.id,
        text: newComment.trim(),
      });
      setNewComment("");
      openComments(commentOpen);
      setVideos((prev) =>
        prev.map((v) =>
          v.id === commentOpen
            ? { ...v, comments_count: (v.comments_count || 0) + 1 }
            : v
        )
      );
      onRewardPoints?.(2);
      showPointsReward?.(2, "Commentaire");
    } catch {
      showToast("Erreur commentaire", "error");
    }
  };

  const handleRepost = async (v) => {
    if (!user) return showToast("Connecte-toi pour reposter", "error");
    try {
      await supabase.from("videos").insert({
        author_id: user.id,
        video_url: v.video_url,
        title: `🔁 ${v.title}`,
        description: `Repost de @${v.profiles?.handle || "membre"}`,
        duration: v.duration || "00:00",
        views: 0,
        likes: 0,
        is_repost: true,
        original_author_id: v.author_id,
      });
      showToast("Reposté !", "success");
      onRewardPoints?.(5);
      showPointsReward?.(5, "Repost");
      loadVideos();
    } catch {
      showToast("Erreur repost", "error");
    }
  };

  const handleShare = async (v) => {
    const url = `\( {window.location.origin}?video= \){v.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: v.title, text: "Regarde sur BAARO", url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setShareFeedbackId(v.id);
      showToast("Lien copié !", "success");
      setTimeout(() => setShareFeedbackId(null), 2000);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return showToast("Sélectionne une vidéo", "error");

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return showToast("Tu n'es pas connecté", "error");
    if (selectedFile.size > 100 * 1024 * 1024) return showToast("Max 100 Mo", "error");

    setUploading(true);
    setUploadProgress(20);

    try {
      const ext = selectedFile.name.split(".").pop() || "mp4";
      const fileName = `\( {Date.now()}. \){ext}`;
      const path = `\( {currentUser.id}/ \){fileName}`;

      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, selectedFile, {
          cacheControl: "3600",
          upsert: false
        });

      if (upErr) throw upErr;
      setUploadProgress(70);

      const { data: { publicUrl } } = supabase.storage
        .from("videos")
        .getPublicUrl(path);

      const { error: dbErr } = await supabase.from("videos").insert({
        author_id: currentUser.id,
        video_url: publicUrl,
        title: uploadTitle.trim() || "Vidéo BAARO",
        description: uploadDescription.trim() || null,
        duration: "00:00",
        views: 0,
        likes: 0,
        sound_id: selectedSound?.id || null,
      });

      if (dbErr) throw dbErr;
      setUploadProgress(100);

      showToast("Vidéo publiée ! 🎉", "success");
      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDescription("");
      setSelectedSound(null);
      onRewardPoints?.(30);
      showPointsReward?.(30, "Vidéo publiée");
      loadVideos();
    } catch (err) {
      console.error(err);
      showToast("Erreur : " + (err.message || "upload échoué"), "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCreateStory = async () => {
    if (!storyFile) return showToast("Choisis une photo ou vidéo", "error");

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return showToast("Tu n'es pas connecté", "error");

    setUploadingStory(true);
    try {
      const ext = storyFile.name.split(".").pop() || "jpg";
      const path = `\( {currentUser.id}/ \){Date.now()}.${ext
