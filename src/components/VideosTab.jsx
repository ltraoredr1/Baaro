import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Play, Pause, Heart, MessageCircle, Share2, Coins, Volume2, VolumeX, Music, Upload, X, Plus, Repeat2, Check } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";

export function VideosTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [muted, setMuted] = useState(true); // Par défaut muet pour permettre l'autoplay
  const [likedMap, setLikedMap] = useState({});
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [shareFeedbackId, setShareFeedbackId] = useState(null);

  const videoRefs = useRef({});
  const observerRef = useRef(null);

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
          profiles:author_id (display_name, handle, flag, avatar_url)
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

  // 🎯 INTERSECTION OBSERVER pour l'autoplay style TikTok
  useEffect(() => {
    if (videos.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const videoEl = entry.target;
          const videoId = videoEl.getAttribute('data-id');
          
          // Si la vidéo est à plus de 60% visible à l'écran
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setPlayingId(videoId);
            videoEl.play().catch((e) => {
              // Fallback si l'autoplay avec son est bloqué par le navigateur
              if (e.name === 'NotAllowedError') {
                videoEl.muted = true;
                setMuted(true);
                videoEl.play();
              }
            });
          } else {
            videoEl.pause();
            videoEl.currentTime = 0; // Remet au début pour la prochaine fois
          }
        });
      },
      { threshold: 0.6 } // Déclenche quand 60% de la vidéo est visible
    );

    // Observer toutes les vidéos
    Object.values(videoRefs.current).forEach((videoEl) => {
      if (videoEl) observerRef.current.observe(videoEl);
    });

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [videos]);

  const handleLike = async (videoId) => {
    const isLiked = likedMap[videoId];
    setLikedMap(prev => ({ ...prev, [videoId]: !isLiked }));

    const video = videos.find(v => v.id === videoId);
    if (video) {
      const newLikes = (video.likes || 0) + (isLiked ? -1 : 1);
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, likes: newLikes } : v));
      await supabase.from('videos').update({ likes: newLikes }).eq('id', videoId);
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

  const handleUseSound = (v) => {
    setUploadTitle(`Son original de @${v.profiles?.handle || 'membre'}`);
    setUploadDescription(`Je crée avec le son de ${v.profiles?.display_name || 'ce membre'} 🎵`);
    setShowUpload(true);
    showToast("Prêt à créer avec ce son ! 🎵", "success");
  };

  const handleShare = async (v) => {
    const shareUrl = `${window.location.origin}?video=${v.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: v.title, text: `Regarde sur BAARO`, url: shareUrl }); } 
      catch (err) { console.log("Partage annulé"); }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedbackId(v.id);
        showToast("Lien copié !", "success");
        setTimeout(() => setShareFeedbackId(null), 2000);
      } catch (err) { showToast("Erreur copie", "error"); }
    }
  };

  const handleRepost = async (v) => {
    if (!user) return showToast("Connecte-toi pour reposter", "error");
    try {
      const { error } = await supabase.from('videos').insert({
        author_id: user.id,
        video_url: v.video_url,
        title: `🔁 Repost de @${v.profiles?.handle || 'membre'} : ${v.title}`,
        description: v.description || "Repost BAARO",
        duration: v.duration || '00:00',
        views: 0,
        likes: 0,
        is_repost: true,
        original_author_id: v.author_id
      });
      if (error) throw error;
      showToast("✅ Vidéo repostée !", "success");
      onRewardPoints?.(5);
      showPointsReward(5, "Repost effectué");
      loadVideos();
    } catch (error) {
      showToast('Erreur lors du repost', 'error');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return showToast('Sélectionne une vidéo', 'error');
    setUploading(true);
    setUploadProgress(10);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `videos/${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('videos').upload(filePath, selectedFile);
      if (uploadError) throw uploadError;
      setUploadProgress(50);

      const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(filePath);
      const { error: dbError } = await supabase.from('videos').insert({
        author_id: user.id, video_url: publicUrl, title: uploadTitle || 'Vidéo BAARO',
        description: uploadDescription, duration: '00:00', views: 0, likes: 0
      });
      if (dbError) throw dbError;
      setUploadProgress(100);
      
      showToast('✅ Vidéo publiée !', 'success');
      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDescription("");
      onRewardPoints?.(30);
      showPointsReward(30, "Vidéo publiée");
      loadVideos();
    } catch (error) {
      showToast('Erreur upload: ' + error.message, 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-gray-400">
        <div className="animate-spin text-3xl mb-2">⏳</div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-gray-400 p-8 text-center">
        <div className="text-5xl mb-4">🎬</div>
        <p className="font-bold text-white text-lg">Aucune vidéo pour le moment</p>
        <p className="text-sm mt-2 mb-6">Soyez le premier à publier sur BAARO !</p>
        <button onClick={() => setShowUpload(true)} className="px-6 py-3 rounded-xl font-bold flex items-center gap-2" style={{ background: COLORS.gold, color: "#000" }}>
          <Plus size={18} /> Publier une vidéo
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Container principal avec Scroll Snap (Style TikTok) */}
      <div className="h-[100dvh] w-full overflow-y-scroll snap-y snap-mandatory bg-black no-scrollbar relative">
        
        {/* Header flottant */}
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-4 bg-gradient-to-b from-black/80 to-transparent">
          <h2 className="text-lg font-bold text-white">BAARO Videos</h2>
          <div className="flex gap-3">
            <button onClick={() => setMuted(!muted)} className="p-2 rounded-full bg-white/10 backdrop-blur-md text-white">
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button onClick={() => setShowUpload(true)} className="p-2 rounded-full bg-white/10 backdrop-blur-md text-white">
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Liste des vidéos */}
        {videos.map((v) => {
          const isPlaying = playingId === v.id;
          const isLiked = likedMap[v.id];
          const profile = v.profiles || {};
          const isRepost = v.is_repost || v.title?.startsWith('🔁 Repost');

          return (
            <div key={v.id} className="h-[100dvh] w-full snap-start relative flex items-center justify-center bg-black">
              
              {/* Vidéo plein écran */}
              <video
                ref={el => { if (el) videoRefs.current[v.id] = el; }}
                data-id={v.id}
                src={v.video_url}
                className="h-full w-full object-cover"
                loop
                playsInline
                muted={muted}
                poster={v.thumbnail_url}
              />

              {/* Overlay gradient pour lisibilité du texte */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30 pointer-events-none" />

              {/* Badge Repost */}
              {isRepost && (
                <div className="absolute top-20 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 bg-black/50 border-yellow-500/50 text-yellow-400 backdrop-blur-sm z-10">
                  <Repeat2 size={12} /> REPOST
                </div>
              )}

              {/* Bouton Play/Pause au centre (apparaît si en pause) */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Play size={40} className="text-white ml-1" fill="white" />
                  </div>
                </div>
              )}

              {/* --- UI SUPERPOSÉE (Style TikTok) --- */}
              
              {/* Infos en bas à gauche */}
              <div className="absolute bottom-20 left-4 right-20 z-10 flex flex-col gap-3 pointer-events-auto">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-gray-800">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg">{profile.flag || '🌍'}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-1">
                      @{profile.handle || 'membre'} 
                      {profile.flag && <span className="text-xs">{profile.flag}</span>}
                    </div>
                    <div className="text-xs text-gray-300">{profile.display_name || 'Membre BAARO'}</div>
                  </div>
                </div>

                <p className="text-sm text-white leading-snug line-clamp-2">
                  {v.title} {v.description && `• ${v.description}`}
                </p>

                {/* Bouton Utiliser le son */}
                <button 
                  onClick={() => handleUseSound(v)}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full w-fit hover:bg-white/20 transition"
                >
                  <Music size={14} className="text-white animate-spin-slow" />
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] text-gray-300">Son original</span>
                    <span className="text-xs font-bold text-white truncate max-w-[150px]">
                      {profile.display_name || 'Membre'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Barre d'actions à droite */}
              <div className="absolute right-3 bottom-24 flex flex-col gap-5 items-center z-10">
                <button onClick={() => handleLike(v.id)} className="flex flex-col items-center gap-1 group">
                  <div className={`p-3 rounded-full backdrop-blur-md transition group-hover:scale-110 ${isLiked ? 'bg-pink-500/20' : 'bg-white/10'}`}>
                    <Heart size={28} className={isLiked ? 'text-pink-500' : 'text-white'} fill={isLiked ? "currentColor" : "none"} />
                  </div>
                  <span className="text-xs font-bold text-white">{v.likes || 0}</span>
                </button>

                <button onClick={() => showToast("Commentaires bientôt", "info")} className="flex flex-col items-center gap-1 group">
                  <div className="p-3 rounded-full bg-white/10 backdrop-blur-md transition group-hover:scale-110">
                    <MessageCircle size={28} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-white">{v.comments_count || 0}</span>
                </button>

                <button onClick={() => handleRepost(v)} className="flex flex-col items-center gap-1 group">
                  <div className="p-3 rounded-full bg-white/10 backdrop-blur-md transition group-hover:scale-110">
                    <Repeat2 size={28} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-white">Repost</span>
                </button>

                <button onClick={() => handleTip(profile.display_name || 'Membre')} className="flex flex-col items-center gap-1 group">
                  <div className="p-3 rounded-full bg-yellow-500/20 backdrop-blur-md transition group-hover:scale-110 border border-yellow-500/50">
                    <Coins size={28} className="text-yellow-400" />
                  </div>
                  <span className="text-xs font-bold text-white">Tip</span>
                </button>

                <button onClick={() => handleShare(v)} className="flex flex-col items-center gap-1 group">
                  <div className="p-3 rounded-full bg-white/10 backdrop-blur-md transition group-hover:scale-110">
                    {shareFeedbackId === v.id ? <Check size={28} className="text-green-400" /> : <Share2 size={28} className="text-white" />}
                  </div>
                  <span className="text-xs font-bold text-white">{shareFeedbackId === v.id ? "Copié" : "Partager"}</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal Upload (inchangée, elle s'affiche par-dessus) */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl p-6 border" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">📤 Publier une vidéo</h3>
              <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div onClick={() => document.getElementById('videoInput').click()} className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition" style={{ borderColor: selectedFile ? COLORS.gold : COLORS.border }}>
                {selectedFile ? (
                  <div>
                    <p className="text-white font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">🎬</div>
                    <p className="text-gray-400">Clique pour sélectionner</p>
                  </div>
                )}
                <input id="videoInput" type="file" accept="video/*" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              </div>
              <input type="text" placeholder="Titre" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white outline-none border border-gray-700" />
              <textarea placeholder="Description" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} rows={2} className="w-full bg-black/30 rounded-xl px-4 py-3 text-sm text-white outline-none border border-gray-700 resize-none" />
              
              {uploading && (
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="h-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: COLORS.gold }} />
                </div>
              )}

              <button onClick={handleUpload} disabled={!selectedFile || uploading} className="w-full py-3 rounded-xl font-bold transition disabled:opacity-40" style={{ background: COLORS.gold, color: "#000" }}>
                {uploading ? 'Publication...' : 'Publier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS pour cacher la scrollbar tout en gardant le scroll */}
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-spin-slow { animation: spin 3s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
