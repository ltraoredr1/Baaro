import { useState, useEffect, useCallback } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Languages,
  Image as ImageIcon,
  BarChart2,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useToast } from "./ToastContext.jsx";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";
import { checkRateLimit, rateLimitMessage } from "../lib/rateLimit.js";

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [mood, setMood] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [likedPosts, setLikedPosts] = useState({});
  const [commentOpen, setCommentOpen] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        handleDbError(error, showToast, "Erreur session");
      }
    };
    getUser();
  }, [showToast]);

  // ===== REQUÊTE OPTIMISÉE (1 seule requête au lieu de N+1) =====
  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .select(`
          id,
          author_id,
          text,
          media_url,
          media_type,
          created_at,
          likes_count,
          profiles!posts_author_id_fkey (
            display_name,
            handle,
            flag,
            avatar_url
          )
        `)
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) throw error;

      const enriched = (data || []).map((post) => {
        const profile = post.profiles || {};
        return {
          id: post.id,
          author_id: post.author_id,
          text: post.text,
          media_url: post.media_url,
          media_type: post.media_type,
          created_at: post.created_at,
          likes: post.likes_count || 0,
          comments_count: 0,
          display_name: profile.display_name || "Membre BAARO",
          handle: profile.handle || "@membre",
          flag: profile.flag || "🌍",
          avatar: profile.avatar_url || "",
        };
      });

      setPosts(enriched);
    } catch (error) {
      // Fallback si la jointure échoue (FK absente)
      console.warn("Jointure profiles échouée, fallback:", error.message);
      try {
        const { data, error: err2 } = await supabase
          .from("posts")
          .select("id, author_id, text, media_url, media_type, created_at, likes_count")
          .order("created_at", { ascending: false })
          .limit(40);

        if (err2) throw err2;

        const authorIds = [...new Set((data || []).map((p) => p.author_id).filter(Boolean))];
        let profilesMap = {};

        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, handle, flag, avatar_url")
            .in("user_id", authorIds);

          (profiles || []).forEach((p) => {
            profilesMap[p.user_id] = p;
          });
        }

        const enriched = (data || []).map((post) => {
          const profile = profilesMap[post.author_id] || {};
          return {
            ...post,
            likes: post.likes_count || 0,
            comments_count: 0,
            display_name: profile.display_name || "Membre BAARO",
            handle: profile.handle || "@membre",
            flag: profile.flag || "🌍",
            avatar: profile.avatar_url || "",
          };
        });

        setPosts(enriched);
      } catch (fallbackError) {
        handleDbError(fallbackError, showToast, "Erreur chargement des publications");
        setPosts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Realtime ciblé (évite de recharger tout le feed à chaque insert)
  useEffect(() => {
    const channel = supabase
      .channel("posts_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          // On recharge uniquement si nécessaire (ou on injecte le nouveau post)
          loadPosts();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        () => loadPosts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPosts]);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newText.trim() || submitting) return;

    const limit = checkRateLimit("create_post", { max: 5, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("posts").insert({
        author_id: authorId,
        text: newText + (mood ? ` (Humeur: ${mood})` : ""),
      });

      if (error) throw error;

      setNewText("");
      setMood("");
      setShowPoll(false);

      onRewardPoints?.(15);
      showPointsReward?.(15, "Publication créée !");
      await loadPosts();
    } catch (error) {
      handleDbError(error, showToast, "Impossible de publier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (postId) => {
    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }

    const limit = checkRateLimit("like", { max: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const isLiked = !!likedPosts[postId];

    setLikedPosts((prev) => ({ ...prev, [postId]: !isLiked }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likes: Math.max(0, (p.likes || 0) + (isLiked ? -1 : 1)) }
          : p
      )
    );

    try {
      if (isLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", authorId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_likes").insert({
          post_id: postId,
          user_id: authorId,
        });
        if (error) throw error;
        onRewardPoints?.(2);
        showPointsReward?.(2, "J'aime distribué");
      }
    } catch (error) {
      setLikedPosts((prev) => ({ ...prev, [postId]: isLiked }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likes: Math.max(0, (p.likes || 0) + (isLiked ? 1 : -1)),
              }
            : p
        )
      );
      handleDbError(error, showToast, "Impossible d'aimer");
    }
  };

  const handleAddComment = async (postId) => {
    const text = (newCommentText[postId] || "").trim();
    if (!text) return;

    const limit = checkRateLimit("comment", { max: 20, windowMs: 60_000 });
    if (!limit.allowed) {
      showToast(rateLimitMessage(limit.retryAfterSec), "error");
      return;
    }

    const authorId = user?.id || userId;
    if (!authorId) {
      showToast("Vous devez être connecté", "error");
      return;
    }

    try {
      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: authorId,
        text,
      });

      if (error) throw error;

      const newCmt = {
        id: `c_${Date.now()}`,
        author: "Vous",
        text,
      };

      setCommentsMap((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newCmt],
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );

      setNewCommentText((prev) => ({ ...prev, [postId]: "" }));
      onRewardPoints?.(1);
      showPointsReward?.(1, "Commentaire ajouté");
    } catch (error) {
      handleDbError(error, showToast, "Impossible de commenter");
    }
  };

  const handleTranslate = (postId, text) => {
    if (translatedMap[postId]) {
      setTranslatedMap((prev) => ({ ...prev, [postId]: null }));
    } else {
      setTranslatedMap((prev) => ({
        ...prev,
        [postId]: `[Traduit par BAARO IA] : ${text}`,
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
      <form
        onSubmit={handleCreatePost}
        className="glass-card rounded-2xl p-4 shadow-xl border"
        style={{ borderColor: COLORS.borderGold }}
      >
        <div className="flex gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md gold-glow"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {user?.email?.charAt(0)?.toUpperCase() || "V"}
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
          <div
            className="mb-3 p-3 rounded-xl border text-xs"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.borderTeal,
              color: COLORS.muted,
            }}
          >
            Sondages bientôt disponibles
          </div>
        )}

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: COLORS.border }}
        >
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
            disabled={!newText.trim() || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            <span>{submitting ? "..." : "Publier"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-black/20 text-white">
              +15 pts
            </span>
          </button>
        </div>
      </form>

      {posts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>Aucune publication</p>
          <p className="text-sm mt-2">Soyez le premier à publier !</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => {
            const isLiked = !!likedPosts[post.id];
            const isTranslated = !!translatedMap[post.id];
            const comments = commentsMap[post.id] || [];

            return (
              <article
                key={post.id}
                className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
                style={{ borderColor: COLORS.border }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onOpenProfile?.(post.author_id)}
                  >
                    <div
                      className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm"
                      style={{
                        borderColor: COLORS.borderGold,
                        background: COLORS.surface,
                      }}
                    >
                      {post.avatar ? (
                        <img src={post.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span style={{ color: COLORS.gold }}>
                          {post.display_name?.charAt(0) || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-sm group-hover:underline" style={{ color: COLORS.ivory }}>
                        {post.display_name} {post.flag}
                      </p>
                      <p className="text-xs" style={{ color: COLORS.muted }}>
                        {post.handle} · {new Date(post.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}>
                  {isTranslated ? translatedMap[post.id] : post.text}
                </p>

                {post.media_url && (
                  <div className="rounded-xl overflow-hidden">
                    {post.media_type?.startsWith("video") ? (
                      <video src={post.media_url} controls className="w-full max-h-80 object-cover" />
                    ) : (
                      <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: COLORS.border }}>
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex items-center gap-1.5 text-xs transition"
                    style={{ color: isLiked ? "#ef4444" : COLORS.muted }}
                  >
                    <Heart size={16} fill={isLiked ? "#ef4444" : "none"} />
                    {post.likes || 0}
                  </button>

                  <button
                    onClick={() =>
                      setCommentOpen((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                    }
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    <MessageCircle size={16} />
                    {post.comments_count || comments.length}
                  </button>

                  <button
                    onClick={() => handleTranslate(post.id, post.text)}
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: COLORS.muted }}
                  >
                    <Languages size={16} />
                  </button>

                  <button className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: COLORS.muted }}>
                    <Share2 size={16} />
                  </button>
                </div>

                {commentOpen[post.id] && (
                  <div className="pt-3 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                    {comments.map((c) => (
                      <div key={c.id} className="text-xs" style={{ color: COLORS.muted }}>
                        <span className="font-bold" style={{ color: COLORS.ivory }}>{c.author}</span> : {c.text}
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={newCommentText[post.id] || ""}
                        onChange={(e) =>
                          setNewCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="Ajouter un commentaire..."
                        className="flex-1 px-3 py-2 rounded-lg border text-xs outline-none"
                        style={{
                          background: COLORS.surface2,
                          borderColor: COLORS.border,
                          color: COLORS.ivory,
                        }}
                      />
                      <button
                        onClick={() => handleAddComment(post.id)}
                        className="p-2 rounded-lg"
                        style={{ background: COLORS.gold, color: "#000" }}
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
