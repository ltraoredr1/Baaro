import { useState, useEffect } from "react";
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
import { usePosts } from "../hooks/dataHooks.js";
import { useComments } from "../hooks/useSocial.js";

function CommentSection({ postId, userId, onRewardPoints }) {
  const { comments, addComment } = useComments(postId);
  const [text, setText] = useState("");
  const { showToast, showPointsReward } = useToast();

  const submit = async () => {
    if (!text.trim()) return;
    const ok = await addComment(userId, text);
    if (ok) {
      setText("");
      onRewardPoints?.(1);
      showPointsReward?.(1, "Commentaire ajouté");
    } else {
      showToast("Erreur lors de l'ajout du commentaire", "error");
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: COLORS.border }}>
      <div className="text-xs font-semibold" style={{ color: COLORS.muted }}>
        Commentaires ({comments.length})
      </div>
      {comments.map((c) => (
        <div
          key={c.id}
          className="p-2.5 rounded-xl text-xs flex flex-col gap-1"
          style={{ background: COLORS.surface }}
        >
          <span className="font-bold" style={{ color: COLORS.gold }}>
            {c.author} {c.flag}
          </span>
          <span style={{ color: COLORS.ivory }}>{c.text}</span>
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <input
          type="text"
          placeholder="Ajouter un commentaire..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 bg-transparent border rounded-xl px-3 py-1.5 text-xs outline-none"
          style={{ borderColor: COLORS.border, color: COLORS.ivory }}
        />
        <button
          onClick={submit}
          className="p-2 rounded-xl"
          style={{ background: COLORS.teal, color: COLORS.bg }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export function FeedTab({ userId, onOpenProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();
  const { posts, loading, likePost, createPost, reload } = usePosts(userId);
  const [newText, setNewText] = useState("");
  const [mood, setMood] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [commentOpen, setCommentOpen] = useState({});
  const [translatedMap, setTranslatedMap] = useState({});
  const [filter, setFilter] = useState("all"); // all | following

  // Pour le filtre "Abonnements"
  const [followingIds, setFollowingIds] = useState([]);
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", userId);
      setFollowingIds((data || []).map((r) => r.followed_id));
    })();
  }, [userId]);

  const filteredPosts =
    filter === "following"
      ? posts.filter((p) => followingIds.includes(p.authorId) || p.authorId === userId)
      : posts;

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newText.trim() && !mediaFile) return;
    if (!userId) {
      showToast("Vous devez être connecté", "error");
      return;
    }
    const text = newText + (mood ? ` (Humeur: ${mood})` : "");
    await createPost(text, mediaFile);
    setNewText("");
    setMood("");
    setMediaFile(null);
    setShowPoll(false);
    onRewardPoints?.(15);
    showPointsReward?.(15, "Publication créée !");
  };

  const handleLike = async (postId) => {
    const post = posts.find((p) => p.id === postId);
    const wasLiked = post?.liked;
    await likePost(postId);
    if (!wasLiked) {
      onRewardPoints?.(2);
      showPointsReward?.(2, "J'aime distribué");
    }
  };

  const handleTranslate = (postId, text) => {
    setTranslatedMap((prev) =>
      prev[postId] ? { ...prev, [postId]: null } : { ...prev, [postId]: `[Traduit] ${text}` }
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-400">
        <div className="animate-spin text-2xl mb-2">⏳</div>
        Chargement du fil...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      {/* Filtres */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition"
          style={{
            background: filter === "all" ? COLORS.gold : COLORS.surface,
            color: filter === "all" ? COLORS.bg : COLORS.muted,
          }}
        >
          Pour vous
        </button>
        <button
          onClick={() => setFilter("following")}
          className="px-4 py-1.5 rounded-full text-xs font-semibold transition"
          style={{
            background: filter === "following" ? COLORS.gold : COLORS.surface,
            color: filter === "following" ? COLORS.bg : COLORS.muted,
          }}
        >
          Abonnements
        </button>
      </div>

      {/* Composer */}
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
            V
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

        {mediaFile && (
          <div className="mb-2 text-xs" style={{ color: COLORS.teal }}>
            📎 {mediaFile.name}
            <button
              type="button"
              onClick={() => setMediaFile(null)}
              className="ml-2 text-rose-400"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className="flex items-center justify-between pt-2 border-t"
          style={{ borderColor: COLORS.border }}
        >
          <div className="flex items-center gap-2">
            <label className="p-2 rounded-lg hover:bg-white/5 text-amber-400 flex items-center gap-1 text-xs cursor-pointer">
              <ImageIcon size={16} />
              <span className="hidden sm:inline">Média</span>
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              />
            </label>
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
            disabled={!newText.trim() && !mediaFile}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            <span>Publier</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-black/20 text-white">
              +15 pts
            </span>
          </button>
        </div>
      </form>

      {/* Liste */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>
            {filter === "following"
              ? "Aucun post de vos abonnements. Suivez des membres !"
              : "Aucune publication. Soyez le premier !"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredPosts.map((post) => {
            const isTranslated = !!translatedMap[post.id];
            return (
              <article
                key={post.id}
                className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
                style={{ borderColor: COLORS.border }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onOpenProfile?.(post.authorId)}
                  >
                    <div
                      className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm"
                      style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
                    >
                      <span style={{ color: COLORS.gold }}>
                        {post.name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div>
                      <div
                        className="flex items-center gap-1.5 text-sm font-semibold"
                        style={{ color: COLORS.ivory }}
                      >
                        {post.name} {post.flag}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.muted }}>
                        {post.handle} •{" "}
                        {new Date(post.created_at || Date.now()).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTranslate(post.id, post.text)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border"
                    style={{
                      background: COLORS.surface,
                      borderColor: COLORS.border,
                      color: COLORS.muted,
                    }}
                  >
                    <Languages size={13} style={{ color: COLORS.teal }} />
                    <span>{isTranslated ? "Original" : "Traduire"}</span>
                  </button>
                </div>

                <p className="text-sm leading-relaxed" style={{ color: COLORS.ivory }}>
                  {isTranslated ? translatedMap[post.id] : post.text}
                </p>

                {post.mediaUrl && (
                  <div className="rounded-xl overflow-hidden">
                    {post.mediaType === "video" ? (
                      <video src={post.mediaUrl} controls className="w-full max-h-80 object-cover" />
                    ) : (
                      <img
                        src={post.mediaUrl}
                        alt=""
                        className="w-full max-h-80 object-cover"
                      />
                    )}
                  </div>
                )}

                <div
                  className="flex items-center justify-between pt-3 border-t text-xs font-medium"
                  style={{ borderColor: COLORS.border }}
                >
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                      post.liked ? "text-rose-400 bg-rose-500/10" : "hover:bg-white/5"
                    }`}
                    style={{ color: post.liked ? "#EC4899" : COLORS.muted }}
                  >
                    <Heart size={16} fill={post.liked ? "#EC4899" : "none"} />
                    <span>{post.likes || 0}</span>
                  </button>

                  <button
                    onClick={() =>
                      setCommentOpen((prev) => ({
                        ...prev,
                        [post.id]: !prev[post.id],
                      }))
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition"
                    style={{ color: COLORS.muted }}
                  >
                    <MessageCircle size={16} />
                    <span>{post.comments || 0}</span>
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
                  <CommentSection
                    postId={post.id}
                    userId={userId}
                    onRewardPoints={onRewardPoints}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
