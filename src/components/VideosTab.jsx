import { useState } from "react";
import { Play, Pause, Heart, MessageCircle, Share2, Coins, Volume2, VolumeX, Music, Award } from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { STABLE_USERS } from "../data/users.js";

const DEMO_VIDEOS = [
  {
    id: "v1",
    author: "Fatou Diop",
    handle: "@fatou_tech",
    flag: "🇸🇳",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80",
    title: "Démo pratique : Échanger des BARO Coins hors-ligne via Bluetooth 📲⚡",
    likes: 1240,
    comments: 184,
    tips: 450,
    audioTrack: "Son original - Fatou Tech",
    poster: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "v2",
    author: "Carlos Ruiz",
    handle: "@carlos_latam",
    flag: "🇲🇽",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    title: "Comment j'ai gagné 500 points BAARO en participant aux débats communautaires 🏆",
    likes: 890,
    comments: 92,
    tips: 230,
    audioTrack: "Crypto Vibes - Instrumental",
    poster: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "v3",
    author: "Kenji Takahashi",
    handle: "@kenji_tokyo",
    flag: "🇯🇵",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    title: "WebRTC & Mesh Networks : Le futur des réseaux sociaux mondiaux",
    likes: 2100,
    comments: 310,
    tips: 920,
    audioTrack: "Future Synth - Web3 Beats",
    poster: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80"
  }
];

export function VideosTab({ onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [playingId, setPlayingId] = useState("v1");
  const [muted, setMuted] = useState(false);
  const [likedMap, setLikedMap] = useState({});

  const handleLike = (id) => {
    const isLiked = likedMap[id];
    setLikedMap((prev) => ({ ...prev, [id]: !isLiked }));
    if (!isLiked) {
      onRewardPoints(3);
      showPointsReward(3, "Vidéo appréciée");
    }
  };

  const handleTip = (authorName) => {
    onRewardPoints(5);
    showToast(`5 points envoyés en pourboire à ${authorName} ! 💖`, "points");
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto w-full pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gradient-gold">Vidéos & Shorts BAARO</h2>
          <p className="text-xs" style={{ color: COLORS.muted }}>Découvrez et soutenez les créateurs mondiaux</p>
        </div>
        <button
          onClick={() => setMuted(!muted)}
          className="p-2 rounded-xl border glass-panel"
          style={{ borderColor: COLORS.border, color: COLORS.ivory }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      <div className="flex flex-col gap-8">
        {DEMO_VIDEOS.map((v) => {
          const isPlaying = playingId === v.id;
          const isLiked = likedMap[v.id];

          return (
            <div key={v.id} className="relative rounded-3xl overflow-hidden glass-card border shadow-2xl flex flex-col" style={{ borderColor: COLORS.borderGold, minHeight: "480px" }}>
              <div className="relative w-full h-[380px] bg-slate-950 overflow-hidden flex items-center justify-center">
                <img src={v.poster} alt={v.title} className="w-full h-full object-cover opacity-80" />
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
                  HD Video
                </div>

                <div className="absolute right-4 bottom-12 flex flex-col gap-4 items-center z-10">
                  <button
                    onClick={() => handleLike(v.id)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border hover:scale-110 transition"
                    style={{ borderColor: isLiked ? "#EC4899" : COLORS.border, color: isLiked ? "#EC4899" : COLORS.ivory }}
                  >
                    <Heart size={20} fill={isLiked ? "#EC4899" : "none"} />
                    <span className="text-[10px] font-bold">{v.likes + (isLiked ? 1 : 0)}</span>
                  </button>

                  <button
                    onClick={() => showToast("Commentaires vidéo", "info")}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border hover:scale-110 transition"
                    style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                  >
                    <MessageCircle size={20} />
                    <span className="text-[10px] font-bold">{v.comments}</span>
                  </button>

                  <button
                    onClick={() => handleTip(v.author)}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-full glass-panel border gold-glow hover:scale-110 transition"
                    style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
                  >
                    <Coins size={20} />
                    <span className="text-[10px] font-bold">Tip</span>
                  </button>

                  <button
                    onClick={() => showToast("Lien vidéo copié !", "success")}
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
                    <img src={v.avatar} alt={v.author} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1" style={{ color: COLORS.ivory }}>
                      {v.author} {v.flag}
                    </div>
                    <div className="text-[10px]" style={{ color: COLORS.muted }}>{v.handle}</div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: COLORS.ivory }}>
                  {v.title}
                </p>

                <div className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.teal }}>
                  <Music size={12} />
                  <span className="truncate">{v.audioTrack}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
