import { useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Sparkles,
  PlusCircle,
  Languages,
  Image as ImageIcon,
  Smile,
  BarChart2,
  TrendingUp,
  Award,
  CheckCircle2,
  Coins,
  BadgeCheck
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { STABLE_USERS } from "../data/users.js";

const DEMO_STORIES = [
  { id: 1, name: "Vous", avatar: "👤", isUser: true, hasNew: false },
  ...STABLE_USERS.slice(0, 5).map((u) => ({
    id: u.id,
    name: u.display_name.split(" ")[0],
    avatar: u.flag,
    photo: u.avatar,
    hasNew: true
  }))
];

const INITIAL_POSTS = [
  {
    id: "p1",
    author_id: "u_amina",
    display_name: "Amina Kouyaté",
    handle: "@amina_dakar",
    flag: "🇸🇳",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    isVerified: true,
    text: "Lancement officiel de notre coopérative solaire locale à Dakar ! Les transactions en BARO Coin permettent aux habitants d'échanger de l'énergie de manière décentralisée. ⚡🌱 #GreenTech #BaroCoin #AfricaTech",
    likes: 142,
    comments_count: 8,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    poll: {
      question: "Pensez-vous que les micro-grids solaires soutiendront le développement local ?",
      options: [
        { label: "Oui, totalement", votes: 84 },
        { label: "Besoin de plus de données", votes: 16 }
      ],
      totalVotes: 100
    }
  },
  {
    id: "p2",
    author_id: "u_kenji",
    display_name: "Kenji Takahashi",
    handle: "@kenji_tokyo",
    flag: "🇯🇵",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    isVerified: true,
    text: "Une journée incroyable au sommet Web3 de Tokyo. Le potentiel du réseau BAARO pour relier la communauté mondiale sans frais bancaires est tout simplement révolutionnaire ! 🚀",
    likes: 289,
    comments_count: 14,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "p3",
    author_id: "u_sarah",
    display_name: "Sarah Jenkins",
    handle: "@sarah_austin",
    flag: "🇺🇸",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    isVerified: true,
    text: "Petite question pour la communauté : quel est le moyen le plus efficace d'accumuler vos premiers points BAARO ? J'utilise le parrainage et la création de contenu !",
    likes: 97,
    comments_count: 5,
    created_at: new Date(Date.now() - 14400000).toISOString(),
  }
];

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [newText, setNewText] = useState("");
  const [mood, setMood] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOpt1, setPollOpt1] = useState("");
  const [pollOpt2, setPollOpt2] = useState("");
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({
    p1: [{ id: "c1", author: "Kenji T.", text: "Félicitations pour cette initiative !" }]
  });
  const [newCommentText, setNewCommentText] = useState("");
  const [translatedMap, setTranslatedMap] = useState({});

  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const newPostObj = {
      id: `p_${Date.now()}`,
      author_id: userId || "u_me",
      display_name: "Vous",
      handle: "@mon_compte",
      flag: "🌍",
      isVerified: true,
      text: newText + (mood ? ` (Humeur: ${mood})` : ""),
      likes: 0,
      comments_count: 0,
      created_at: new Date().toISOString(),
      poll: showPoll && pollQ.trim() ? {
        question: pollQ,
        options: [
          { label: pollOpt1 || "Oui", votes: 0 },
          { label: pollOpt2 || "Non", votes: 0 }
        ],
        totalVotes: 0
      } : null
    };

    setPosts([newPostObj, ...posts]);
    setNewText("");
    setMood("");
    setShowPoll(false);
    setPollQ("");
    setPollOpt1("");
    setPollOpt2("");

    onRewardPoints(15);
    showPointsReward(15, "Publication engageante créée !");
  };

  const handleLike = (postId) => {
    const isLiked = likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isLiked }));
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, likes: p.likes + (isLiked ? -1 : 1) } : p))
    );

    if (!isLiked) {
      onRewardPoints(2);
      showPointsReward(2, "J'aime distribué");
    }
  };

  const handleAddComment = (postId) => {
    if (!newCommentText.trim()) return;
    const newCmt = { id: `c_${Date.now()}`, author: "Vous", text: newCommentText };
    setCommentsMap((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), newCmt] }));
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p))
    );
    setNewCommentText("");
    onRewardPoints(1);
    showPointsReward(1, "Commentaire ajouté");
  };

  const handleTranslate = (postId, text) => {
    if (translatedMap[postId]) {
      setTranslatedMap((prev) => ({ ...prev, [postId]: null }));
    } else {
      setTranslatedMap((prev) => ({
        ...prev,
        [postId]: `[Traduit par BAARO IA] : ${text}`
      }));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      {/* Stories Bar */}
      <div className="flex items-center gap-3 overflow-x-auto py-2 px-1 no-scrollbar">
        {DEMO_STORIES.map((s) => (
          <div key={s.id} onClick={() => onOpenProfile(s.id)} className="flex flex-col items-center gap-1 cursor-pointer group flex-shrink-0">
            <div
              className={`w-16 h-16 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                s.hasNew ? "bg-gradient-to-tr from-amber-500 to-teal-400 p-[2px]" : "border border-amber-500/20"
              }`}
            >
              <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center font-bold text-lg" style={{ background: COLORS.surface2 }}>
                {s.photo ? (
                  <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{s.avatar}</span>
                )}
              </div>
            </div>
            <span className="text-[11px] font-medium max-w-[64px] truncate" style={{ color: COLORS.ivory }}>
              {s.name}
            </span>
          </div>
        ))}
      </div>

      {/* Post Composer */}
      <form onSubmit={handleCreatePost} className="glass-card rounded-2xl p-4 shadow-xl border" style={{ borderColor: COLORS.borderGold }}>
        <div className="flex gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md gold-glow" style={{ background: COLORS.gold, color: COLORS.bg }}>
            V
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Quoi de neuf dans votre monde ? Partagez une pensée, une idée ou un projet..."
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
            style={{ color: COLORS.ivory }}
            rows={3}
          />
        </div>

        {/* Poll fields toggle */}
        {showPoll && (
          <div className="mb-3 p-3 rounded-xl border flex flex-col gap-2" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
            <span className="text-xs font-semibold" style={{ color: COLORS.teal }}>Créer un Sondage</span>
            <input
              type="text"
              placeholder="Question du sondage..."
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              className="bg-transparent border-b text-xs py-1 outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Option 1"
                value={pollOpt1}
                onChange={(e) => setPollOpt1(e.target.value)}
                className="bg-transparent border rounded-lg text-xs p-1.5 outline-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
              <input
                type="text"
                placeholder="Option 2"
                value={pollOpt2}
                onChange={(e) => setPollOpt2(e.target.value)}
                className="bg-transparent border rounded-lg text-xs p-1.5 outline-none"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              />
            </div>
          </div>
        )}

        {/* Toolbar & Submit */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => showToast("Upload d'image simulé", "info")}
              className="p-2 rounded-lg hover:bg-white/5 text-amber-400 flex items-center gap-1 text-xs"
            >
              <ImageIcon size={16} />
              <span className="hidden sm:inline">Média</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPoll(!showPoll)}
              className="p-2 rounded-lg hover:bg-white/5 text-teal-400 flex items-center gap-1 text-xs"
            >
              <BarChart2 size={16} />
              <span className="hidden sm:inline">Sondage</span>
            </button>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="bg-transparent text-xs p-1 rounded border outline-none"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              <option value="" className="bg-slate-900">Humeur ?</option>
              <option value="🔥 Inspiré" className="bg-slate-900">🔥 Inspiré</option>
              <option value="💡 Innovant" className="bg-slate-900">💡 Innovant</option>
              <option value="🎉 Joyeux" className="bg-slate-900">🎉 Joyeux</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!newText.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: COLORS.bg }}
          >
            <span>Publier</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-black/20 text-white">+15 pts</span>
          </button>
        </div>
      </form>

      {/* Feed List */}
      <div className="flex flex-col gap-4">
        {posts.map((post) => {
          const isLiked = likedPosts[post.id];
          const isTranslated = !!translatedMap[post.id];
          const comments = commentsMap[post.id] || [];

          return (
            <article key={post.id} className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
              {/* Post Header */}
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => onOpenProfile(post.author_id)}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm" style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}>
                    {post.avatar ? (
                      <img src={post.avatar} alt={post.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span style={{ color: COLORS.gold }}>{post.display_name.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold group-hover:text-amber-400 transition" style={{ color: COLORS.ivory }}>
                      {post.display_name} {post.flag}
                      {post.isVerified && <BadgeCheck size={15} style={{ color: COLORS.teal }} />}
                    </div>
                    <div className="text-xs" style={{ color: COLORS.muted }}>
                      {post.handle} • {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleTranslate(post.id, post.text)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border hover:border-amber-400/50 transition"
                  style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.muted }}
                >
                  <Languages size={13} style={{ color: COLORS.teal }} />
                  <span>{isTranslated ? "Original" : "Traduire"}</span>
                </button>
              </div>

              {/* Post Content */}
              <p className="text-sm leading-relaxed" style={{ color: COLORS.ivory }}>
                {isTranslated ? translatedMap[post.id] : post.text}
              </p>

              {/* Optional Post Image */}
              {post.image && (
                <div className="rounded-xl overflow-hidden max-h-72 border" style={{ borderColor: COLORS.border }}>
                  <img src={post.image} alt="Post content" className="w-full h-full object-cover hover:scale-105 transition duration-500" />
                </div>
              )}

              {/* Optional Poll */}
              {post.poll && (
                <div className="p-3 rounded-xl border flex flex-col gap-2" style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}>
                  <div className="text-xs font-bold" style={{ color: COLORS.gold }}>Sondage communautaire</div>
                  <div className="text-xs" style={{ color: COLORS.ivory }}>{post.poll.question}</div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {post.poll.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => showPointsReward(1, "Vote comptabilisé")}
                        className="w-full text-left p-2 rounded-lg text-xs flex justify-between items-center border hover:border-amber-400/50 transition"
                        style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
                      >
                        <span>{opt.label}</span>
                        <span className="font-mono text-[11px]" style={{ color: COLORS.teal }}>{opt.votes} votes</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t text-xs font-medium" style={{ borderColor: COLORS.border }}>
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                    isLiked ? "text-rose-400 bg-rose-500/10" : "hover:bg-white/5"
                  }`}
                  style={{ color: isLiked ? "#EC4899" : COLORS.muted }}
                >
                  <Heart size={16} fill={isLiked ? "#EC4899" : "none"} />
                  <span>{post.likes}</span>
                </button>

                <button
                  onClick={() => setCommentOpen((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                  style={{ color: COLORS.muted }}
                >
                  <MessageCircle size={16} />
                  <span>{post.comments_count}</span>
                </button>

                <button
                  onClick={() => showToast("Lien de partage copié !", "success")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                  style={{ color: COLORS.muted }}
                >
                  <Share2 size={16} />
                  <span>Partager</span>
                </button>
              </div>

              {/* Comments Section Drawer */}
              {commentOpen[post.id] && (
                <div className="flex flex-col gap-2 pt-3 border-t mt-1" style={{ borderColor: COLORS.border }}>
                  <div className="text-xs font-semibold" style={{ color: COLORS.muted }}>Commentaires</div>
                  {comments.map((c) => (
                    <div key={c.id} className="p-2.5 rounded-xl text-xs flex flex-col gap-1" style={{ background: COLORS.surface }}>
                      <span className="font-bold" style={{ color: COLORS.gold }}>{c.author}</span>
                      <span style={{ color: COLORS.ivory }}>{c.text}</span>
                    </div>
                  ))}

                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Ajouter un commentaire..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 bg-transparent border rounded-xl px-3 py-1.5 text-xs outline-none"
                      style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                    />
                    <button
                      onClick={() => handleAddComment(post.id)}
                      className="p-2 rounded-xl"
                      style={{ background: COLORS.teal, color: COLORS.bg }}
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
