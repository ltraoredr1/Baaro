import { useState, useEffect } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Languages,
  Image as ImageIcon,
  BarChart2,
  BadgeCheck
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [mood, setMood] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOpt1, setPollOpt1] = useState("");
  const [pollOpt2, setPollOpt2] = useState("");
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState("");
  const [translatedMap, setTranslatedMap] = useState({});
  const [user, setUser] = useState(null);

  // Charger l'utilisateur connecté
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Charger les publications
  const loadPosts = async () => {
    setLoading(true);
    try {
      // Requête simplifiée SANS la relation profiles
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Enrichir avec les données utilisateur depuis users
      const enrichedPosts = await Promise.all(data.map(async (post) => {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name, handle, flag, avatar_url')
          .eq('id', post.author_id)
          .single();
        
        return {
          ...post,
          display_name: userData?.display_name || 'Membre',
          handle: userData?.handle || '@utilisateur',
          flag: userData?.flag || '🌍',
          avatar: userData?.avatar_url || '',
          isVerified: false
        };
      }));

      setPosts(enrichedPosts);
    } catch (error) {
      console.error('Erreur chargement posts:', error);
      showToast('Erreur chargement des publications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  // Souscrire aux changements en temps réel
  useEffect(() => {
    const subscription = supabase
      .channel('posts_channel')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => loadPosts()
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        () => loadPosts()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    if (!user) {
      showToast('Vous devez être connecté', 'error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          text: newText + (mood ? ` (Humeur: ${mood})` : "")
        })
        .select();

      if (error) throw error;

      setNewText("");
      setMood("");
      setShowPoll(false);
      setPollQ("");
      setPollOpt1("");
      setPollOpt2("");

      onRewardPoints(15);
      showPointsReward(15, "Publication créée !");
      await loadPosts();
    } catch (error) {
      console.error('Erreur publication:', error);
      showToast('Erreur: ' + error.message, 'error');
    }
  };

  const handleLike = async (postId) => {
    const isLiked = likedPosts[postId];
    setLikedPosts((prev) => ({ ...prev, [postId]: !isLiked }));
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, likes: (p.likes || 0) + (isLiked ? -1 : 1) } : p))
    );

    const post = posts.find(p => p.id === postId);
    if (post) {
      await supabase
        .from('posts')
        .update({ likes: (post.likes || 0) + (isLiked ? -1 : 1) })
        .eq('id', postId);
    }

    if (!isLiked) {
      onRewardPoints(2);
      showPointsReward(2, "J'aime distribué");
    }
  };

  const handleAddComment = async (postId) => {
    if (!newCommentText.trim()) return;
    
    const newCmt = { 
      id: `c_${Date.now()}`, 
      author: "Vous", 
      text: newCommentText 
    };
    
    setCommentsMap((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), newCmt] }));
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p))
    );
    
    const post = posts.find(p => p.id === postId);
    if (post) {
      await supabase
        .from('posts')
        .update({ comments_count: (post.comments_count || 0) + 1 })
        .eq('id', postId);
    }
    
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

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-400">
        <div className="animate-spin text-2xl mb-2">⏳</div>
        Chargement...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      {/* Post Composer */}
      <form onSubmit={handleCreatePost} className="glass-card rounded-2xl p-4 shadow-xl border" style={{ borderColor: COLORS.borderGold }}>
        <div className="flex gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md gold-glow" style={{ background: COLORS.gold, color: COLORS.bg }}>
            {user?.email?.charAt(0).toUpperCase() || 'V'}
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Quoi de neuf ?"
            className="flex-1 bg-transparent resize-none outline-none text-sm leading-relaxed"
            style={{ color: COLORS.ivory }}
            rows={3}
          />
        </div>

        {showPoll && (
          <div className="mb-3 p-3 rounded-xl border flex flex-col gap-2" style={{ background: COLORS.surface, borderColor: COLORS.borderTeal }}>
            <span className="text-xs font-semibold" style={{ color: COLORS.teal }}>Sondage</span>
            <input
              type="text"
              placeholder="Question..."
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

        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => showToast("Upload d'image en développement", "info")}
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
              <option value="">Humeur ?</option>
              <option value="🔥 Inspiré">🔥 Inspiré</option>
              <option value="💡 Innovant">💡 Innovant</option>
              <option value="🎉 Joyeux">🎉 Joyeux</option>
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
      {posts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>Aucune publication</p>
          <p className="text-sm mt-2">Soyez le premier à publier !</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => {
            const isLiked = likedPosts[post.id];
            const isTranslated = !!translatedMap[post.id];
            const comments = commentsMap[post.id] || [];

            return (
              <article key={post.id} className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3" style={{ borderColor: COLORS.border }}>
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onOpenProfile && onOpenProfile(post.author_id)}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm" style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}>
                      {post.avatar ? (
                        <img src={post.avatar} alt={post.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span style={{ color: COLORS.gold }}>{post.display_name?.charAt(0) || '?'}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: COLORS.ivory }}>
                        {post.display_name} {post.flag}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.muted }}>
                        {post.handle} • {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTranslate(post.id, post.text)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border"
                    style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.muted }}
                  >
                    <Languages size={13} style={{ color: COLORS.teal }} />
                    <span>{isTranslated ? "Original" : "Traduire"}</span>
                  </button>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: COLORS.ivory }}>
                  {isTranslated ? translatedMap[post.id] : post.text}
                </p>

                <div className="flex items-center justify-between pt-3 border-t text-xs font-medium" style={{ borderColor: COLORS.border }}>
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                      isLiked ? "text-rose-400 bg-rose-500/10" : "hover:bg-white/5"
                    }`}
                    style={{ color: isLiked ? "#EC4899" : COLORS.muted }}
                  >
                    <Heart size={16} fill={isLiked ? "#EC4899" : "none"} />
                    <span>{post.likes || 0}</span>
                  </button>

                  <button
                    onClick={() => setCommentOpen((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                    style={{ color: COLORS.muted }}
                  >
                    <MessageCircle size={16} />
                    <span>{post.comments_count || 0}</span>
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

                {commentOpen[post.id] && (
                  <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                    <div className="text-xs font-semibold" style={{ color: COLORS.muted }}>Commentaires</div>
                    {comments.length > 0 ? (
                      comments.map((c) => (
                        <div key={c.id} className="p-2.5 rounded-xl text-xs flex flex-col gap-1" style={{ background: COLORS.surface }}>
                          <span className="font-bold" style={{ color: COLORS.gold }}>{c.author}</span>
                          <span style={{ color: COLORS.ivory }}>{c.text}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs" style={{ color: COLORS.muted }}>Aucun commentaire</p>
                    )}

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
      )}
    </div>
  );
}
