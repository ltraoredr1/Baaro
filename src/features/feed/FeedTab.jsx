import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Trash2,
  MoreHorizontal,
  Image as ImageIcon,
  Send,
  Sparkles,
} from "lucide-react";

// Chemins d'accès corrigés (3 niveaux depuis src/features/feed/)
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { supabase } from "../../supabaseClient.js";
import { handleDbError } from "../../../lib/dbErrors.js";
import { fetchFeedPage } from "../../../lib/feedLoader.js";
import { recordFeedEvent } from "../../../lib/feedEvents.js";

import { PollCard, SocialPostEnhancements, SocialSuggestions } from "./SocialEnhancements.jsx";
import { RichTextComposer } from "../../components/RichTextComposer.jsx";
import { RichTextRenderer } from "../../components/RichTextRenderer.jsx";
import { EngagementList } from "../../components/EngagementList.jsx";
import { TipButton } from "../../components/TipButton.jsx";

const PAGE_SIZE = 20;

export function FeedTab({ userId, onOpenProfile }) {
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Saisie enrichie, IA, sondages & médias
  const [newText, setNewText] = useState("");
  const [pollData, setPollData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Session & modales
  const [user, setUser] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [engagement, setEngagement] = useState(null);

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);
  const meId = user?.id || userId;

  // Récupération de la session Supabase
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        handleDbError(error, showToast, "Erreur de session");
      }
    };
    getUser();
  }, [showToast]);

  // Nettoyage de l'URL d'aperçu média
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // 1. Chargement initial du flux
  const loadPosts = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    try {
      const { rows, nextCursor } = await fetchFeedPage({ cursor: null, pageSize: PAGE_SIZE });

      const formattedRows = rows.map((post) => {
        const profile = post.profiles || {};
        const rawHandle = profile.handle || "membre";
        const cleanHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;

        return {
          id: post.id,
          author_id: post.author_id,
          text: post.text,
          media_url: post.media_url,
          media_type: post.media_type,
          created_at: post.created_at,
          likes: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          views_count: post.views_count || 0,
          display_name: profile.display_name || "Membre BAARO",
          handle: cleanHandle,
          flag: profile.flag || "🌍",
          avatar: profile.avatar_url || "",
        };
      });

      setPosts(formattedRows);
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
    } catch (error) {
      handleDbError(error, showToast, "Erreur lors du chargement du fil");
      setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // 2. Défilement infini (Infinite Scroll)
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore || loading || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { rows, nextCursor } = await fetchFeedPage({ cursor: cursorRef.current, pageSize: PAGE_SIZE });

      const formattedRows = rows.map((post) => {
        const profile = post.profiles || {};
        const rawHandle = profile.handle || "membre";
        const cleanHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;

        return {
          id: post.id,
          author_id: post.author_id,
          text: post.text,
          media_url: post.media_url,
          media_type: post.media_type,
          created_at: post.created_at,
          likes: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          views_count: post.views_count || 0,
          display_name: profile.display_name || "Membre BAARO",
          handle: cleanHandle,
          flag: profile.flag || "🌍",
          avatar: profile.avatar_url || "",
        };
      });

      setPosts((prev) => [...prev, ...formattedRows]);
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
    } catch (error) {
      handleDbError(error, showToast, "Erreur lors de la récupération de la suite du fil");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Détection du bas de page via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMorePosts();
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMorePosts]);

  // 3. Publication d'un message avec Médias & Sondages
  const handlePublish = async () => {
    const hasText = Boolean(newText.trim());
    const hasMedia = Boolean(mediaFile);
    const hasPoll = Boolean(pollData?.question?.trim());

    if (!hasText && !hasMedia && !hasPoll) return;

    setSubmitting(true);
    try {
      let mediaUrl = null;
      let mediaType = null;

      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const filePath = `${meId}/${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage.from("posts_media").upload(filePath, mediaFile);
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from("posts_media").getPublicUrl(filePath);
        mediaUrl = publicUrl;
        mediaType = mediaFile.type;
      }

      // Enregistrement du post principal
      const { data: newPost, error: postErr } = await supabase
        .from("posts")
        .insert([
          {
            author_id: meId,
            text: newText,
            media_url: mediaUrl,
            media_type: mediaType,
          },
        ])
        .select()
        .single();

      if (postErr) throw postErr;

      // Enregistrement du sondage si présent
      if (hasPoll && newPost) {
        const validOptions = pollData.options.filter((opt) => opt.trim() !== "");
        const { error: pollErr } = await supabase.from("polls").insert([
          {
            post_id: newPost.id,
            question: pollData.question,
            options: validOptions,
          },
        ]);
        if (pollErr) console.warn("Erreur d'enregistrement du sondage:", pollErr.message);
      }

      setNewText("");
      setPollData(null);
      setMediaFile(null);
      setMediaPreview(null);
      showToast("Perspective diffusée avec succès sur le réseau mondial !", "success");
      loadPosts();
    } catch (err) {
      handleDbError(err, showToast, "Échec de la publication");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-xs font-medium tracking-widest uppercase opacity-70">
        Synchronisation du flux mondial et des analyses d'impact...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
      {/* MODULE DE RÉDACTION AVANCÉ (IA + SONDAGES + MÉDIAS) */}
      {meId && (
        <div
          className="glass-card rounded-2xl p-4 shadow-xl border flex flex-col gap-3 transition-all"
          style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
        >
          <div
            className="flex items-center gap-2 border-b pb-2 text-xs font-semibold"
            style={{ borderColor: COLORS.border, color: COLORS.gold }}
          >
            <Sparkles size={15} />
            <span>Créer une publication à fort impact</span>
          </div>

          <RichTextComposer
            value={newText}
            onChange={setNewText}
            pollData={pollData}
            onPollChange={setPollData}
            placeholder="Partagez une perspective, une analyse ou une innovation avec le monde..."
            rows={3}
            disabled={submitting}
          />

          {mediaPreview && (
            <div
              className="relative rounded-xl overflow-hidden max-h-60 border"
              style={{ borderColor: COLORS.border }}
            >
              <button
                type="button"
                onClick={() => {
                  setMediaFile(null);
                  setMediaPreview(null);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
              >
                <X size={14} />
              </button>
              {mediaFile?.type?.startsWith("video") ? (
                <video src={mediaPreview} controls className="w-full h-full object-cover" />
              ) : (
                <img src={mediaPreview} alt="Aperçu" className="w-full h-full object-cover" />
              )}
            </div>
          )}

          <div
            className="flex items-center justify-between border-t pt-3 flex-wrap gap-2"
            style={{ borderColor: COLORS.border }}
          >
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setMediaFile(file);
                    setMediaPreview(URL.createObjectURL(file));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Joindre un média"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
                style={{ color: COLORS.gold }}
              >
                <ImageIcon size={16} />
                <span>Média</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={submitting || (!newText.trim() && !mediaFile && !pollData?.question)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              {submitting ? "Publication..." : "Publier"} <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {meId && <SocialSuggestions userId={meId} onOpenProfile={onOpenProfile} />}

      {/* FLUX DE PUBLICATIONS */}
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="glass-card rounded-2xl p-5 shadow-xl border flex flex-col gap-3"
            style={{ borderColor: COLORS.border }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
                >
                  {post.avatar ? (
                    <img src={post.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: COLORS.gold }}>{post.display_name?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-sm flex items-center gap-1" style={{ color: COLORS.ivory }}>
                    {post.display_name} {post.flag}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.muted }}>
                    {post.handle} ·{" "}
                    {new Date(post.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {post.author_id === meId && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpenId((id) => (id === post.id ? null : post.id))}
                    className="p-2 rounded-lg hover:bg-white/5"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpenId === post.id && (
                    <div
                      className="absolute right-0 top-9 z-20 min-w-[160px] rounded-xl border shadow-xl py-1"
                      style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          setMenuOpenId(null);
                          if (confirm("Supprimer la publication ?")) {
                            await supabase.from("posts").delete().eq("id", post.id);
                            loadPosts();
                          }
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TEXTE ENRICHI MARKDOWN */}
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: COLORS.ivory }}>
              <RichTextRenderer content={post.text} />
            </div>

            {/* MÉDIA (IMAGE OU VIDÉO) */}
            {post.media_url && (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: COLORS.border }}>
                {post.media_type?.startsWith("video") ? (
                  <video
                    src={post.media_url}
                    controls
                    className="w-full max-h-80 object-cover bg-black"
                    onEnded={() => recordFeedEvent(post.id, "complete")}
                  />
                ) : (
                  <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
                )}
              </div>
            )}

            {/* SONDAGE & ACTIONS SOCIALES */}
            <PollCard postId={post.id} userId={meId} />
            <SocialPostEnhancements post={post} userId={meId} />

            {/* BARRE D'ENGAGEMENT HAUT DE GAMME */}
            <div
              className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap"
              style={{ borderColor: COLORS.border }}
            >
              <div className="flex items-center gap-3 text-[11px] font-medium" style={{ color: COLORS.muted }}>
                <span className="flex items-center gap-1">👁️ {Number(post.views_count || 0)} vues certifiées</span>
                <span>·</span>
                <span className="flex items-center gap-1">❤️ {Number(post.likes || 0)} approbations</span>
                {post.author_id === meId && (
                  <button
                    type="button"
                    onClick={() => setEngagement({ type: "postLikes", id: post.id })}
                    className="text-[10px] underline ml-2 hover:text-white transition-colors"
                  >
                    Audience détaillée
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {post.author_id !== meId && (
                  <TipButton
                    recipientId={post.author_id}
                    postId={post.id}
                    label="✨ Soutenir ce talent"
                    className="h-8 px-3 rounded-full text-xs font-semibold border transition-all shadow-sm"
                    style={{
                      background: `${COLORS.gold}15`,
                      borderColor: COLORS.borderGold,
                      color: COLORS.gold,
                    }}
                  />
                )}
                <button
                  title="Archiver"
                  onClick={() => {
                    recordFeedEvent(post.id, "save");
                    showToast("Publication archivée dans votre coffre-fort", "info");
                  }}
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-xs hover:bg-white/10 transition-colors"
                  style={{ background: COLORS.surface2, borderColor: COLORS.border }}
                >
                  🔖
                </button>
                <button
                  title="Diffuser à l'international"
                  onClick={() => {
                    recordFeedEvent(post.id, "share");
                    if (navigator.share) {
                      navigator.share({ title: "BAARO", text: post.text, url: window.location.href });
                    } else {
                      showToast("Lien de diffusion copié !", "success");
                    }
                  }}
                  className="w-8 h-8 rounded-full border flex items-center justify-center text-xs hover:bg-white/10 transition-colors"
                  style={{ background: COLORS.surface2, borderColor: COLORS.border }}
                >
                  ↗️
                </button>
              </div>
            </div>
          </article>
        ))}

        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      </div>

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={meId}
          viewerId={meId}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default FeedTab;
