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
      .select("id, content, created_at, profiles:author_id (display_name, handle, flag)")
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
        title: "🔁 " + v.title,
        description: "Repost de @" + (v.profiles?.handle || "membre"),
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
    const url = window.location.origin + "?video=" + v.id;
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
      const fileName = Date.now() + "." + ext;
      const path = currentUser.id + "/" + fileName;

      const { error: upErr } = await supabase.storage
        .from("videos")
        .upload(path, selectedFile, { cacheControl: "3600", upsert: false });

      if (upErr) throw upErr;
      setUploadProgress(70);

      const { data: { publicUrl } } = supabase.storage.from("videos").getPublicUrl(path);

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
      const path = currentUser.id + "/" + Date.now() + "." + ext;

      const { error: upErr } = await supabase.storage.from("stories").upload(path, storyFile);
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("stories").getPublicUrl(path);
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
      onRewardPoints?.(15);
      showPointsReward?.(15, "Story publiée");
    } catch (err) {
      showToast("Erreur story : " + err.message, "error");
    } finally {
      setUploadingStory(false);
    }
  };

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
            <button onClick={() => setMuted(!muted)} className="p-2.5 rounded-full bg-white/15 backdrop-blur-md text-white">
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button onClick={() => setShowUpload(true)} className="p-2.5 rounded-full bg-white/15 backdrop-blur-md text-white">
              <Plus size={20} />
            </button>
          </div>
        </div>

        {loadError ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-bold text-lg mb-2">Erreur de chargement</p>
            <p className="text-gray-400 text-sm mb-6 max-w-xs">{loadError}</p>
            <button onClick={loadVideos} className="px-5 py-2.5 rounded-xl font-bold" style={{ background: COLORS.gold, color: "#000" }}>
              Réessayer
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
            <div className="text-6xl mb-4">🎬</div>
            <p className="text-white font-bold text-xl mb-2">Aucune vidéo</p>
            <button onClick={() => setShowUpload(true)} className="mt-4 px-6 py-3 rounded-2xl font-bold" style={{ background: COLORS.gold, color: "#000" }}>
              Publier une vidéo
            </button>
          </div>
        ) : (
          videos.map((v) => {
            const isPlaying = playingId === v.id;
            const isLiked = !!likedMap[v.id];
            const profile = v.profiles || {};
            const hasError = !!videoErrors[v.id];

            return (
              <div key={v.id} className="h-full w-full snap-start relative flex items-center justify-center bg-black">
                <video
                  ref={(el) => { if (el) videoRefs.current[v.id] = el; }}
                  data-id={v.id}
                  src={v.video_url}
                  className="h-full w-full object-cover"
                  loop
                  playsInline
                  muted={muted}
                  onClick={() => {
                    const el = videoRefs.current[v.id];
                    if (!el || hasError) return;
                    if (el.paused) el.play().catch(() => {});
                    else el.pause();
                  }}
                  onError={() => setVideoErrors((prev) => ({ ...prev, [v.id]: true }))}
                />

                {hasError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-20 p-6 text-center">
                    <div className="text-5xl mb-4">⚠️</div>
                    <p className="text-white font-bold text-lg mb-2">Impossible de lire cette vidéo</p>
                    <button
                      onClick={() => {
                        setVideoErrors((prev) => {
                          const copy = { ...prev };
                          delete copy[v.id];
                          return copy;
                        });
                        const el = videoRefs.current[v.id];
                        if (el) { el.load(); el.play().catch(() => {}); }
                      }}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: COLORS.gold, color: "#000" }}
                    >
                      Réessayer
                    </button>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40 pointer-events-none" />

                {v.is_repost && (
                  <div className="absolute top-16 left-4 px-3 py-1 rounded-full text-[10px] font-bold bg-black/60 border border-yellow-500/40 text-yellow-400 z-10 flex items-center gap-1.5">
                    <Repeat2 size={12} /> REPOST
                  </div>
                )}

                {!isPlaying && !hasError && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
                      <Play size={32} className="text-white ml-1" fill="white" />
                    </div>
                  </div>
                )}

                <div className="absolute bottom-24 left-4 right-20 z-20 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full border-2 border-white overflow-hidden bg-gray-800">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">{profile.flag || "🌍"}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">@{profile.handle || "membre"} {profile.flag}</div>
                      <div className="text-xs text-gray-300">{profile.display_name || "Membre BAARO"}</div>
                    </div>
                  </div>
                  <p className="text-sm text-white leading-snug line-clamp-3">
                    {v.title}
                    {v.description && <span className="text-gray-300"> • {v.description}</span>}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Music size={12} />
                    <span>Son original</span>
                  </div>
                </div>

                <div className="absolute right-3 bottom-28 flex flex-col gap-5 items-center z-20">
                  <button onClick={() => handleLike(v.id)} className="flex flex-col items-center gap-1">
                    <div className={"p-3 rounded-full backdrop-blur-md " + (isLiked ? "bg-pink-500/30" : "bg-white/15")}>
                      <Heart size={26} className={isLiked ? "text-pink-500" : "text-white"} fill={isLiked ? "currentColor" : "none"} />
                    </div>
                    <span className="text-xs font-bold text-white">{v.likes || 0}</span>
                  </button>
                  <button onClick={() => openComments(v.id)} className="flex flex-col items-center gap-1">
                    <div className="p-3 rounded-full bg-white/15 backdrop-blur-md">
                      <MessageCircle size={26} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-white">{v.comments_count || 0}</span>
                  </button>
                  <button onClick={() => handleRepost(v)} className="flex flex-col items-center gap-1">
                    <div className="p-3 rounded-full bg-white/15 backdrop-blur-md">
                      <Repeat2 size={26} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-white">Repost</span>
                  </button>
                  <button onClick={() => handleShare(v)} className="flex flex-col items-center gap-1">
                    <div className="p-3 rounded-full bg-white/15 backdrop-blur-md">
                      {shareFeedbackId === v.id ? <Check size={26} className="text-green-400" /> : <Share2 size={26} className="text-white" />}
                    </div>
                    <span className="text-xs font-bold text-white">{shareFeedbackId === v.id ? "Copié" : "Partager"}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {commentOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-2xl p-4 max-h-[70vh] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-white">Commentaires</h3>
              <button onClick={() => setCommentOpen(null)}><X size={22} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {(comments[commentOpen] || []).map((c) => (
                <div key={c.id} className="text-sm">
                  <span className="font-bold text-white">@{c.profiles?.handle || "membre"}</span>
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
              <button onClick={sendComment} className="p-2.5 rounded-xl" style={{ background: COLORS.gold }}>
                <Send size={18} className="text-black" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">Publier une vidéo</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400"><X size={24} /></button>
            </div>

            <div
              onClick={() => document.getElementById("videoInput").click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-4"
              style={{ borderColor: selectedFile ? COLORS.gold : "rgba(255,255,255,0.15)" }}
            >
              {selectedFile ? (
                <div>
                  <p className="text-white font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(1)} Mo</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-2">🎬</div>
                  <p className="text-gray-400 text-sm">Choisir une vidéo</p>
                </div>
              )}
              <input id="videoInput" type="file" accept="video/*" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </div>

            <input
              type="text"
              placeholder="Titre"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm text-white outline-none border border-white/10 mb-3"
            />
            <textarea
              placeholder="Description"
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              rows={2}
              className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm text-white outline-none border border-white/10 resize-none mb-3"
            />

            <button
              onClick={() => setShowSoundPicker(true)}
              className="w-full py-2.5 mb-4 rounded-xl bg-white/10 text-white text-sm flex items-center justify-center gap-2"
            >
              <Music size={16} />
              {selectedSound ? selectedSound.title : "Ajouter un son"}
            </button>

            {uploading && (
              <div className="w-full bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: uploadProgress + "%", background: COLORS.gold }} />
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full py-3.5 rounded-xl font-bold disabled:opacity-40"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              {uploading ? "Publication... " + uploadProgress + "%" : "Publier"}
            </button>
          </div>
        </div>
      )}

      {showSoundPicker && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/80">
          <div className="w-full max-h-[60vh] rounded-t-3xl bg-[#111] p-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white">Choisir un son</h3>
              <button onClick={() => setShowSoundPicker(false)} className="text-gray-400"><X size={22} /></button>
            </div>
            {sounds.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun son pour le moment</p>
            ) : (
              sounds.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSound(s);
                    setShowSoundPicker(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left"
                >
                  <Music size={18} className="text-yellow-400" />
                  <div>
                    <p className="text-white text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-gray-400">{s.artist || "Son original"}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {showCreateStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">Créer une Story</h3>
              <button onClick={() => setShowCreateStory(false)} className="text-gray-400"><X size={24} /></button>
            </div>
            <div
              onClick={() => document.getElementById("storyInput").click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-4"
              style={{ borderColor: storyFile ? COLORS.gold : "rgba(255,255,255,0.15)" }}
            >
              {storyFile ? (
                <p className="text-white">{storyFile.name}</p>
              ) : (
                <div>
                  <div className="text-4xl mb-2">📸</div>
                  <p className="text-gray-400 text-sm">Photo ou vidéo</p>
                </div>
              )}
              <input id="storyInput" type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setStoryFile(e.target.files?.[0] || null)} />
            </div>
            <input
              type="text"
              placeholder="Texte (optionnel)"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm text-white outline-none border border-white/10 mb-4"
            />
            <button
              onClick={handleCreateStory}
              disabled={!storyFile || uploadingStory}
              className="w-full py-3.5 rounded-xl font-bold disabled:opacity-40"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              {uploadingStory ? "Publication..." : "Publier la Story"}
            </button>
          </div>
        </div>
      )}

      {storyGroup && (
        <StoryViewer group={storyGroup} onClose={() => setStoryGroup(null)} currentUserId={user?.id} />
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
    }
