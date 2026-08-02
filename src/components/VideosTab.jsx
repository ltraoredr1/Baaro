import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Play, Pause, Heart, MessageCircle, Share2, Coins, Volume2, VolumeX, Music, Award, Upload, X, Plus } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

export function VideosTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [likedMap, setLikedMap] = useState({});
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoRefs = useRef({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          profiles:author_id (
            display_name,
            handle,
            flag,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error('Erreur chargement vidéos:', error);
      showToast('Erreur chargement vidéos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (videoId) => {
    const isLiked = likedMap[videoId];
    setLikedMap(prev => ({ ...prev, [videoId]: !isLiked }));

    const video = videos.find(v => v.id === videoId);
    if (video) {
      const newLikes = (video.likes || 0) + (isLiked ? -1 : 1);
      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, likes: newLikes } : v
      ));
      await supabase
        .from('videos')
        .update({ likes: newLikes })
        .eq('id', videoId);
    }

    if (!isLiked) {
      onRewardPoints?.(3);
      showPointsReward(3, "Vidéo appréciée");
    }
  };

  const handleTip = (authorName) => {
    onRewardPoints?.(5);
    showToast(`5 points envoyés à ${authorName} ! 💖`, "points");
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) {
      showToast('Sélectionne une vidéo', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `videos/${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('videos')
        .insert({
          author_id: user.id,
          video_url: publicUrl,
          title: uploadTitle || 'Vidéo BAARO',
          description: uploadDescription,
          duration: '00:00',
          views: 0,
          likes: 0
        });

      if (dbError) throw dbError;

      showToast('✅ Vidéo publiée !', 'success');
      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDescription("");
      onRewardPoints?.(30);
      showPointsReward(30, "Vidéo publiée");
      loadVideos();
    } catch (error) {
      console.error('Erreur upload:', error);
      showToast('Erreur upload: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Gestion de la lecture vidéo
  useEffect(() => {
    Object.keys(videoRefs.current).forEach((id) => {
      const video = videoRefs.current[id];
      if (video) {
        if (playingId === id) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  }, [playingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="animate-spin text-3xl mb-2">⏳</div>
          <p>Chargement des vidéos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto w-full pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gradient-gold">Vidéos & Shorts BAARO</h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>Découvrez et soutenez les créateurs</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMuted(!muted)}
            className="p-2 rounded-xl border glass-panel"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="p-2 rounded-xl border glass-panel"
            style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12 text-gray-400 glass-card rounded-2xl p-8">
          <div className="text-5xl mb-4">🎬</div>
          <p className="font-bold">Aucune vidéo</p>
          <p className="text-sm mt-2">Soyez le premier à publier !</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 px-6 py-2 rounded-xl font-bold"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            📤 Publier une vidéo
          </button>
        </div>
      ) : (
        videos.map((v) => {
          const isPlaying = playingId === v.id;
          const isLiked = likedMap[v.id];
          const profile = v.profiles || {};

          return (
            <div
              key={v.id}
              className="relative rounded-3xl overflow-hidden glass-card border shadow-2xl flex flex-col"
              style={{ borderColor: COLORS.borderGold, minHeight: "480px" }}
            >
              <div className="relative w-full h-[380px] bg-slate-950 overflow-hidden flex items-center justify-center">
                <video
                  ref={el => videoRefs.current[v.id] = el}
                  src={v.video_url}
                  className="w-full h-full object-cover"
                  muted={muted}
                  loop
                  playsInline
                  poster={v.thumbnail_url}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40" />

                <button
                  onClick={() => setPlayingId(isPlaying ? null : v.id)}
                  className="absolute w-16 h-16 rounded-full flex items-center justify-center glass-panel shadow-2xl gold-glow hover:scale-110 transition"
                  style={{ color: COLORS.gold }}
                >
                  {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
                </button>

                <div className="absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5" style={{ background: "rgba(11,18,32,0.8)", borderColor: COLORS.teal, color: COLORS.teal }}>
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  {v.duration || '00:00'}
                </div>

                <div className="absolute right-4 bottom-12 flex flex-col gap-4 items-center z-10">
                  <button
                    onClick={() => handleLike(v.id)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border hover:scale-110 transition"
                    style={{ borderColor: isLiked ? "#EC4899" : COLORS.border, color: isLiked ? "#EC4899" : COLORS.ivory }}
                  >
                    <Heart size={20} fill={isLiked ? "#EC4899" : "none"} />
                    <span className="text-[10px] font-bold">{v.likes || 0}</span>
                  </button>

                  <button
                    onClick={() => showToast("Commentaires bientôt", "info")}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border hover:scale-110 transition"
                    style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                  >
                    <MessageCircle size={20} />
                    <span className="text-[10px] font-bold">{v.comments_count || 0}</span>
                  </button>

                  <button
                    onClick={() => handleTip(profile.display_name || 'Membre')}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border gold-glow hover:scale-110 transition"
                    style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
                  >
                    <Coins size={20} />
                    <span className="text-[10px] font-bold">Tip</span>
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(v.video_url);
                      showToast("Lien vidéo copié !", "success");
                    }}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border hover:scale-110 transition"
                    style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                  >
                    <Share2 size={20} />
                  </button>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-2" style={{ background: COLORS.surface }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden border flex items-center justify-center font-bold text-xs" style={{ borderColor: COLORS.borderGold, background: COLORS.surface2 }}>
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{profile.flag || '🌍'}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1" style={{ color: COLORS.ivory }}>
                      {profile.display_name || 'Membre'} {profile.flag || ''}
                    </div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>{profile.handle || '@utilisateur'}</div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: COLORS.ivory }}>
                  {v.title || v.description || 'Vidéo BAARO'}
                </p>

                <div className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.teal }}>
                  <Music size={12} />
                  <span className="truncate">Son original</span>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Modal upload */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-card rounded-2xl p-6 max-w-md w-full border" style={{ borderColor: COLORS.borderGold }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">📤 Publier une vidéo</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div
                onClick={() => document.getElementById('videoInput').click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-gold-500 transition"
                style={{ borderColor: COLORS.border }}
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
                    <p className="text-gray-400">Clique pour sélectionner une vidéo</p>
                    <p className="text-xs text-gray-500 mt-1">MP4, MOV • Max 50 MB</p>
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
                className="w-full bg-gray-800/50 rounded-xl px-4 py-2 text-sm text-white outline-none border border-gray-700"
              />

              <textarea
                placeholder="Description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
                className="w-full bg-gray-800/50 rounded-xl px-4 py-2 text-sm text-white outline-none border border-gray-700 resize-none"
              />

              {uploading && (
                <div className="space-y-1">
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%`, background: COLORS.gold }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center">{uploadProgress}%</p>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full py-3 rounded-xl font-bold transition disabled:opacity-40"
                style={{ background: COLORS.gold, color: COLORS.bg }}
              >
                {uploading ? '📤 Upload en cours...' : '📤 Publier la vidéo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
