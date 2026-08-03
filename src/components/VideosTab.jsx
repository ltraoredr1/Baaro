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

// ============================================================
// Helper sécurisé : tous les gains de points passent par le serveur
// ============================================================
async function earnPoints(actionKey, detail = "") {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "earn",
        actionKey,
        detail: typeof detail === "string" ? detail.slice(0, 80) : "",
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      console.warn("earnPoints:", json.error);
      return null;
    }
    return json; // { ok, balance, transaction }
  } catch (err) {
    console.error("earnPoints failed:", err);
    return null;
  }
}

export function VideosTab({ onRewardPoints, userId }) {
  const { showToast, showPointsReward } = useToast();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
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
  const [videoErrors, setVideoErrors] = useState({});

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
    setLoadError(null);

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
      setLoadError(err.message || "Impossible de charger les vidéos");
      showToast("Erreur de chargement des vidéos", "error");
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Autoplay style TikTok
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

  // ============================================================
  // LIKE sécurisé
  // ============================================================
  const handleLike = async (videoId) => {
    if (!user) return showToast("Connecte-toi pour aimer", "error");

    const isLiked = !!likedMap[videoId];

    // Optimistic UI
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
        await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", videoId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("video_likes")
          .insert({ video_id: videoId, user_id: user.id });

        const result = await earnPoints("like_video");
        if (result?.balance != null) {
          onRewardPoints?.(result.balance);
          showPointsReward?.(2, "Vidéo aimée");
        }
      }
    } catch (err) {
      // Rollback
      setLikedMap((prev) => ({ ...prev, [videoId]: isLiked }));
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? { ...v, likes: Math.max(0, (v.likes || 0) + (isLiked ? 1 : -1)) }
            : v
        )
      );
      showToast("Erreur like", "error");
    }
  };

  // ============================================================
  // TIP sécurisé
  // ============================================================
  const handleTip = async (authorName) => {
    if (!user) return showToast("Connecte-toi pour envoyer un tip", "error");

    const result = await earnPoints("tip_video", authorName);
    if (result?.balance != null) {
      onRewardPoints?.(result.balance);
      showToast(`5 points envoyés à ${authorName} ! 💖`, "points");
      showPointsReward?.(5, "Tip envoyé");
    } else {
      showToast("Impossible d'envoyer le tip pour le moment", "error");
    }
  };

  // ============================================================
  // REPOST sécurisé
  // ============================================================
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

      const result = await earnPoints("repost_video", v.title);
      if (result?.balance != null) {
        onRewardPoints?.(result.balance);
        showPointsReward?.(5, "Repost");
      }

      showToast("Reposté !", "success");
      loadVideos();
    } catch {
      showToast("Erreur repost", "error");
    }
  };

  // ============================================================
  // UPLOAD sécurisé
  // ============================================================
  const handleUpload = async () => {
    if (!selectedFile) return showToast("Sélectionne une vidéo", "error");

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return showToast("Tu n'es pas connecté", "error");
    if (selectedFile.size > 100 * 1024 * 1024) {
      return showToast("Max 100 Mo", "error");
    }

    setUploading(true);
    setUploadProgress(15);

    try {
      const ext = selectedFile.name.split(".").pop() || "mp4";
      const fileName = `\( {Date.now()}. \){ext}`;
      const path = `\( {currentUser.id}/ \){fileName}`;

      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, selectedFile, { cacheControl: "3600", upsert: false });

      if (upErr) throw upErr;
      setUploadProgress(60);

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
      setUploadProgress(90);

      // Points uniquement via le serveur
      const result = await earnPoints("publish_video", uploadTitle.trim() || "Vidéo");
      if (result?.balance != null) {
        onRewardPoints?.(result.balance);
        showPointsReward?.(25, "Vidéo publiée");
      }

      setUploadProgress(100);
      showToast("Vidéo publiée ! 🎉", "success");

      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDescription("");
      setSelectedSound(null);
      loadVideos();
    } catch (err) {
      console.error(err);
      showToast("Erreur : " + (err.message || "upload échoué"), "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ============================================================
  // COMMENTAIRES
  // ============================================================
  const openComments = async (videoId) => {
    setCommentOpen(videoId);
    const { data } = await supabase
      .from("video_comments")
      .select(`id, content, created_at, profiles:author_id (display_name, handle, flag)`)
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
        content: newComment.trim(),
      });

      setNewComment("");
      openComments(commentOpen);

      // Le trigger met déjà à jour comments_count
      setVideos((prev) =>
        prev.map((v) =>
          v.id === commentOpen
            ? { ...v, comments_count: (v.comments_count || 0) + 1 }
            : v
        )
      );

      const result = await earnPoints("comment_video");
      if (result?.balance != null) {
        onRewardPoints?.(result.balance);
        showPointsReward?.(2, "Commentaire");
      }
    } catch {
      showToast("Erreur commentaire", "error");
    }
  };

  // ============================================================
  // SHARE
  // ============================================================
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

  // ============================================================
  // STORY (inchangé)
  // ============================================================
  const handleCreateStory = async () => {
    if (!storyFile) return showToast("Choisis une photo ou vidéo", "error");

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return showToast("Tu n'es pas connecté", "error");

    setUploadingStory(true);
    try {
      const ext = storyFile.name.split(".").pop() || "jpg";
      const path = `\( {currentUser.id}/ \){Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("stories")
        .upload(path, storyFile);

      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from("stories")
        .getPublicUrl(path);

      const isVideo = storyFile.type.startsWith("video");

      await supabase.from("stories").insert({
        author_id: currentUser.id,
        media_url: publicUrl,
        media_type: isVideo ? "video" : "image",
        text_overlay: storyText.trim() || null,
      });

      showToast("Story publiée ! 🔥", "success");
      setShowCreateStory(false);
      setStoryFile(null);
      setStoryText("");
    } catch (err) {
      showToast("Erreur story : " + err.message, "error");
    } finally {
      setUploadingStory(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh] bg-black text-gray-400">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">🎬</div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-black">
        <StoriesBar
          onOpenStory={setStoryGroup}
          onCreateStory={() => setShowCreateStory(true)}
        />
      </div>

      <div className="h-[calc(100dvh-160px)] w-full overflow-y-scroll snap-y snap-mandatory bg-black no-scrollbar relative">
        <div className="absolute top-0 left-0 right-0 z-30 flex justify-between items-center px-4 py-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <h2 className="text-lg font-bold text-white pointer-events-auto">BAARO Videos</h2>
          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => setMuted(!muted)}
              className="p-2.5 rounded-full bg-white/15 backdrop-blur-md text-white"
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="p-2.5 rounded-full bg-white/15 backdrop-blur-md text-white"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-bold text-lg mb-2">Erreur de chargement</p>
            <p className="text-gray-400 text-sm mb-6 max-w-xs">{loadError}</p>
            <button
              onClick={loadVideos}
              className="px-5 py-2.5 rounded-xl font-bold"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              Réessayer
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
            <div className="text-6xl mb-4">🎬</div>
            <p className="text-white font-bold text-lg">Aucune vidéo pour le moment</p>
            <p className="text-sm mt-2 mb-6">Soyez le premier à publier sur BAARO !</p>
            <button
              onClick={() => setShowUpload(true)}
              className="px-6 py-3 rounded-xl font-bold flex items-center gap-2"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              <Plus size={18} /> Publier une vidéo
            </button>
          </div>
        ) : (
          videos.map((v) => {
            const isPlaying = playingId === v.id;
            const isLiked = !!likedMap[v.id];
            const profile = v.profiles || {};
            const isRepost = v.is_repost || v.title?.startsWith("🔁");

            return (
              <div
                key={v.id}
                className="h-[calc(100dvh-160px)] w-full snap-start relative flex items-center justify-center bg-black"
              >
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[v.id] = el;
                  }}
                  data-id={v.id}
                  src={v.video_url}
                  className="h-full w-full object-cover"
                  loop
                  playsInline
                  muted={muted}
                  poster={v.thumbnail_url}
                  onError={() =>
                    setVideoErrors((prev) => ({ ...prev, [v.id]: true }))
                  }
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30 pointer-events-none" />

                {isRepost && (
                  <div className="absolute top-20 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 bg-black/50 border-yellow-500/50 text-yellow-400 backdrop-blur-sm z-10">
                    <Repeat2 size={12} /> REPOST
                  </div>
                )}

                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                      <Play size={40} className="text-white ml-1" fill="white" />
                    </div>
                  </div>
                )}

                {/* Infos bas gauche */}
                <div className="absolute bottom-24 left-4 right-20 z-10 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-800">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.display_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">
                          {profile.flag || "🌍"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1">
                        @{profile.handle || "membre"}
                        {profile.flag && <span className="text-xs">{profile.flag}</span>}
                      </div>
                      <div className="text-xs text-gray-300">
                        {profile.display_name || "Membre BAARO"}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-white leading-snug line-clamp-2">
                    {v.title} {v.description && `• ${v.description}`}
                  </p>
                </div>

                {/* Actions droite */}
                <div className="absolute right-3 bottom-28 flex flex-col gap-5 items-center z-10">
                  <button onClick={() => handleLike(v.id)} className="flex flex-col items-center gap-1">
                    <div
                      className={`p-3 rounded-full backdrop-blur-md transition ${
                        isLiked ? "bg-pink-500/20" : "bg-white/10"
                      }`}
                    >
                      <Heart
                        size={28}
                        className={isLiked ? "text-pink-500" : "text-white"}
                        fill={isLiked ? "currentColor" : "none"}
                      />
                    </div>
                    <span className="text-xs font-bold text-white">{v.likes || 0}</span>
                  </button>

                  <button
                    onClick={() => openComments(v.id)}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="p-3 rounded-full bg-white/10 backdrop-blur-md">
                      <MessageCircle size={28} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-white">
                      {v.comments_count || 0}
                    </span>
                  </button>

                  <button onClick={() => handleRepost(v)} className="flex flex-col items-center gap-1">
                    <div className="p-3 rounded-full bg-white/10 backdrop-blur-md">
                      <Repeat2 size={28} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-white">Repost</span>
                  </button>

                  <button
                    onClick={() => handleTip(profile.display_name || "Membre")}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="p-3 rounded-full bg-yellow-500/20 backdrop-blur-md border border-yellow-500/50">
                      <Coins size={28} className="text-yellow-400" />
                    </div>
                    <span className="text-xs font-bold text-white">Tip</span>
                  </button>

                  <button onClick={() => handleShare(v)} className="flex flex-col items-center gap-1">
                    <div className="p-3 rounded-full bg-white/10 backdrop-blur-md">
                      {shareFeedbackId === v.id ? (
                        <Check size={28} className="text-green-400" />
                      ) : (
                        <Share2 size={28} className="text-white" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-white">
                      {shareFeedbackId === v.id ? "Copié" : "Partager"}
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Upload */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div
            className="w-full max-w-md rounded-2xl p-6 border"
            style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">📤 Publier une vidéo</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div
                onClick={() => document.getElementById("videoInput").click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition"
                style={{ borderColor: selectedFile ? COLORS.gold : COLORS.border }}
              >
                {selectedFile ? (
                  <div>
                    <p className="text-white font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">🎬</div>
                    <p className="text-gray-400">Clique pour sélectionner</p>
                  </div>
                )}
                <input
                  id="videoInput"
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>

              <input
                type="text"
                placeholder="Titre"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white outline-none border border-gray-700"
              />

              <textarea
                placeholder="Description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
                className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white outline-none border border-gray-700 resize-none"
              />

              {uploading && (
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%`, background: COLORS.gold }}
                  />
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full py-3 rounded-xl font-bold transition disabled:opacity-40"
                style={{ background: COLORS.gold, color: "#000" }}
              >
                {uploading ? "Publication..." : "Publier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Commentaires simple */}
      {commentOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-4 max-h-[70vh] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-white">Commentaires</h3>
              <button onClick={() => setCommentOpen(null)}>
                <X size={22} className="text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {(comments[commentOpen] || []).map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-bold text-white">
                    @{c.profiles?.handle || "membre"}
                  </span>
                  <span className="text-gray-300 ml-2">{c.content}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Ajouter un commentaire..."
                className="flex-1 bg-black/40 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                onKeyDown={(e) => e.key === "Enter" && sendComment()}
              />
              <button
                onClick={sendComment}
                className="p-2.5 rounded-xl"
                style={{ background: COLORS.gold }}
              >
                <Send size={18} className="text-black" />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}
