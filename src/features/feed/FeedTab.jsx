import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Trash2,
  MoreHorizontal,
  Image as ImageIcon,
  Send,
  Sparkles,
  Pencil,
  Flag,
} from "lucide-react";

// Imports via l'alias absolu (@/ -> src/)
import { COLORS } from "@/theme.js";
import { useToast } from "@/components/ToastContext.jsx";
import { supabase } from "@/supabaseClient.js";
import { handleDbError } from "@/lib/dbErrors.js";
import { fetchFeedPage } from "@/lib/feedPagination.js";
import { recordFeedEvent } from "@/lib/feedEvents.js";

import { PollCard, SocialPostEnhancements, SocialSuggestions } from "./SocialEnhancements.jsx";
import { RichTextComposer } from "@/components/RichTextComposer.jsx";
import { RichTextRenderer } from "@/components/RichTextRenderer.jsx";
import { EngagementList } from "@/components/EngagementList.jsx";
import { TipButton } from "@/components/TipButton.jsx";
import { AskAiButton } from "@/components/AskAiButton.jsx";

const PAGE_SIZE = 20;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 Mo

const REPORT_REASONS = [
  "Spam ou arnaque",
  "Harcèlement ou haine",
  "Contenu inapproprié",
  "Fausse information",
  "Autre",
];

/** Transforme une ligne Supabase en objet post prêt à afficher */
function formatPost(post) {
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
}

export function FeedTab({ id, user_id, onOpenProfile }) {
  // MainShell envoie `id` et `user_id`
  const propUserId = id || user_id || null;

  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Saisie enrichie, sondages & médias
  const [newText, setNewText] = useState("");
  const [pollData, setPollData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Session & modales
  const [currentUserId, setCurrentUserId] = useState(propUserId);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [engagement, setEngagement] = useState(null);

  // Modification & signalement
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportPost, setReportPost] = useState(null);

  const fileInputRef = useRef(null);
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);

  const activeUserId = currentUserId || propUserId || null;

  // Session Supabase
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session?.user?.id) setCurrentUserId(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setCurrentUserId(session?.user?.id || null);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Libération de l'URL d'aperçu média
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // Fermer le menu "..." en touchant ailleurs
  useEffect(() => {
    if (!menuOpenId) return;
    const close = (e) => {
      if (!e.target.closest?.("[data-post-menu]")) setMenuOpenId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpenId]);

  // Texte rédigé par l'IA, envoyé vers le champ de publication
  useEffect(() => {
    const apply = (text) => {
      if (!text) return;
      setNewText(text);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    try {
      const draft = sessionStorage.getItem("baaro:ai_draft");
      if (draft) {
        sessionStorage.removeItem("baaro:ai_draft");
        apply(draft);
      }
    } catch {
      // sessionStorage indisponible
    }
    const onDraft = (e) => {
      try { sessionStorage.removeItem("baaro:ai_draft"); } catch {}
      apply(e.detail?.text);
    };
    window.addEventListener("baaro:ai-draft", onDraft);
    return () => window.removeEventListener("baaro:ai-draft", onDraft);
  }, []);

  // 1. Chargement du flux (silent = rafraîchir sans écran de chargement)
  const loadPosts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      cursorRef.current = null;
      try {
        const { rows, nextCursor } = await fetchFeedPage({
          cursor: null,
          pageSize: PAGE_SIZE,
        });
        setPosts(rows.map(formatPost));
        cursorRef.current = nextCursor;
        setHasMore(Boolean(nextCursor));
      } catch (error) {
        handleDbError(error, showToast, "Erreur lors du chargement du fil");
        if (!silent) setPosts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  // 2. Défilement infini
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMore || loading || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const { rows, nextCursor } = await fetchFeedPage({
        cursor: cursorRef.current,
        pageSize: PAGE_SIZE,
      });
      const incoming = rows.map(formatPost);
      // Évite les doublons si un post est apparu entre deux pages
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
      });
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
  }, [loadMorePosts, posts.length]);

  // Choix d'un média
  const handlePickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-choisir le même fichier
    if (!file) return;

    if (file.size > MAX_MEDIA_BYTES) {
      showToast("Fichier trop lourd (50 Mo maximum)", "error");
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  // 3. Publication
  const handlePublish = async () => {
    const hasText = Boolean(newText.trim());
    const hasMedia = Boolean(mediaFile);
    const hasPoll = Boolean(pollData?.question?.trim());

    if (!hasText && !hasMedia && !hasPoll) return;
    if (submitting) return;

    if (!activeUserId) {
      showToast("Veuillez vous connecter pour publier", "error");
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl = null;
      let mediaType = null;

      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const filePath = `${activeUserId}/${Date.now()}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage
          .from("posts_media")
          .upload(filePath, mediaFile);
        if (uploadErr) throw uploadErr;
        const {
          data: { publicUrl },
        } = supabase.storage.from("posts_media").getPublicUrl(filePath);
        mediaUrl = publicUrl;
        mediaType = mediaFile.type;
      }

      const { data: newPost, error: postErr } = await supabase
        .from("posts")
        .insert([
          {
            author_id: activeUserId,
            text: newText,
            media_url: mediaUrl,
            media_type: mediaType,
          },
        ])
        .select()
        .single();

      if (postErr) throw postErr;

      if (hasPoll && newPost) {
        const validOptions = (pollData.options || []).filter((opt) => opt.trim() !== "");
        const { error: pollErr } = await supabase.from("polls").insert([
          {
            post_id: newPost.id,
            question: pollData.question,
            options: validOptions,
          },
        ]);
        if (pollErr) {
          console.warn("Erreur d'enregistrement du sondage:", pollErr.message);
          showToast("Publication envoyée, mais le sondage n'a pas pu être créé", "error");
        }
      }

      setNewText("");
      setPollData(null);
      setMediaFile(null);
      setMediaPreview(null);
      showToast("Perspective diffusée avec succès sur le réseau mondial !", "success");
      loadPosts({ silent: true });
    } catch (err) {
      handleDbError(err, showToast, "Échec de la publication");
    } finally {
      setSubmitting(false);
    }
  };

  // Suppression
  const handleDelete = async (postId) => {
    setMenuOpenId(null);
    if (!confirm("Supprimer la publication ?")) return;

    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      handleDbError(error, showToast, "Suppression impossible");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast("Publication supprimée", "info");
  };

  // Modification
  const startEdit = (post) => {
    setMenuOpenId(null);
    setEditingId(post.id);
    setEditText(typeof post.text === "string" ? post.text : "");
  };

  const handleSaveEdit = async (post) => {
    const text = editText.trim();
    if (!text && !post.media_url) {
      showToast("Le texte ne peut pas être vide", "error");
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("posts")
      .update({ text })
      .eq("id", post.id)
      .eq("author_id", activeUserId);
    setSavingEdit(false);
    if (error) {
      handleDbError(error, showToast, "Modification impossible");
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, text } : p)));
    setEditingId(null);
    showToast("Publication modifiée", "success");
  };

  // Signalement
  const handleReport = async (reason) => {
    const target = reportPost;
    setReportPost(null);
    if (!target || !activeUserId) return;
    const { error } = await supabase.from("reports").insert([
      { reporter_id: activeUserId, post_id: target.id, reason },
    ]);
    if (error) {
      handleDbError(error, showToast, "Signalement impossible");
      return;
    }
    showToast("Merci, le signalement a été envoyé", "success");
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
      {/* MODULE DE RÉDACTION */}
      {activeUserId && (
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
                className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
                aria-label="Retirer le média"
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
                onChange={handlePickFile}
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
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("baaro:ask-ai", {
                      detail: {
                        prompt: newText.trim()
                          ? `Améliore ce brouillon de publication pour BAARO et rends-le plus engageant :\n"${newText.trim()}"\n\n`
                          : "Rédige une publication engageante pour BAARO sur le thème : ",
                      },
                    })
                  )
                }
                title="Rédiger avec l'IA"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-medium"
                style={{ color: COLORS.teal }}
              >
                <Sparkles size={16} />
                <span>IA</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={submitting || (!newText.trim() && !mediaFile && !pollData?.question?.trim())}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              {submitting ? "Publication..." : "Publier"} <Send size={13} />
            </button>
          </div>
        </div>
      )}

      {/* RECOMMANDATIONS D'ABONNEMENT */}
      {activeUserId && <SocialSuggestions user_id={activeUserId} onOpenProfile={onOpenProfile} />}

      {/* ÉTAT VIDE */}
      {posts.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: COLORS.muted }}>
          Aucune publication pour le moment. Sois le premier à partager quelque chose !
        </div>
      )}

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
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(post.author_id)}
                  className="w-10 h-10 rounded-full overflow-hidden border flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
                  aria-label={`Profil de ${post.display_name}`}
                >
                  {post.avatar ? (
                    <img src={post.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span style={{ color: COLORS.gold }}>
                      {post.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </button>
                <div>
                  <p
                    className="font-bold text-sm flex items-center gap-1"
                    style={{ color: COLORS.ivory }}
                  >
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

              {activeUserId && (
                <div className="relative" data-post-menu>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId((cur) => (cur === post.id ? null : post.id))}
                    className="p-2 rounded-lg hover:bg-white/5"
                    aria-label="Options de la publication"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpenId === post.id && (
                    <div
                      className="absolute right-0 top-9 z-20 min-w-[170px] rounded-xl border shadow-xl py-1"
                      style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
                    >
                      {post.author_id === activeUserId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(post)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
                            style={{ color: COLORS.ivory }}
                          >
                            <Pencil size={14} /> Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(post.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                          >
                            <Trash2 size={14} /> Supprimer
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setReportPost(post);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 text-red-400"
                        >
                          <Flag size={14} /> Signaler
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TEXTE ENRICHI */}
            {editingId === post.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{
                    background: COLORS.surface2,
                    borderColor: COLORS.borderGold,
                    color: COLORS.ivory,
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 rounded-xl text-xs border"
                    style={{ borderColor: COLORS.border, color: COLORS.muted }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(post)}
                    disabled={savingEdit}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
                    style={{ background: COLORS.gold, color: "#000" }}
                  >
                    {savingEdit ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: COLORS.ivory }}
              >
                <RichTextRenderer content={post.text} />
              </div>
            )}

            {/* MÉDIA */}
            {post.media_url && (
              <div
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: COLORS.border }}
              >
                {post.media_type?.startsWith("video") ? (
                  <video
                    src={post.media_url}
                    controls
                    preload="metadata"
                    className="w-full max-h-80 object-cover bg-black"
                    onEnded={() => recordFeedEvent(post.id, "complete")}
                  />
                ) : (
                  <img
                    src={post.media_url}
                    alt=""
                    loading="lazy"
                    className="w-full max-h-80 object-cover"
                  />
                )}
              </div>
            )}

            {/* SONDAGES ET INTERACTIONS SOCIALES */}
            <PollCard postId={post.id} user_id={activeUserId} />
            <SocialPostEnhancements post={post} user_id={activeUserId} />

            {/* BARRE D'ENGAGEMENT */}
            <div
              className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap"
              style={{ borderColor: COLORS.border }}
            >
              <div
                className="flex items-center gap-3 text-[11px] font-medium flex-wrap"
                style={{ color: COLORS.muted }}
              >
                <span className="flex items-center gap-1">
                  👁️ {Number(post.views_count || 0)} vues certifiées
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  ❤️ {Number(post.likes || 0)} approbations
                </span>
                {post.author_id === activeUserId && (
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
                <AskAiButton text={typeof post.text === "string" ? post.text : ""} />

                {post.author_id !== activeUserId && (
                  <TipButton recipientId={post.author_id} postId={post.id} compact />
                )}

              </div>
            </div>
          </article>
        ))}

        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && (
          <div className="text-center py-3 text-xs opacity-60">Chargement…</div>
        )}
      </div>

      {reportPost && (
        <div
          className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/70 p-3"
          onClick={() => setReportPost(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-4 flex flex-col gap-2"
            style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-sm" style={{ color: COLORS.ivory }}>
              Pourquoi signaler cette publication ?
            </p>
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleReport(r)}
                className="w-full text-left px-3 py-2.5 rounded-xl border text-xs hover:bg-white/5"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReportPost(null)}
              className="mt-1 text-xs"
              style={{ color: COLORS.muted }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {engagement && (
        <EngagementList
          type={engagement.type}
          targetId={engagement.id}
          ownerId={activeUserId}
          viewerId={activeUserId}
          onClose={() => setEngagement(null)}
        />
      )}
    </div>
  );
}

export default FeedTab;
