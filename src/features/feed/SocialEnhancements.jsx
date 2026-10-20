import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { Bookmark, Check, Share2, UserPlus, X, Zap } from "lucide-react";
import { COLORS } from "../../theme.js";
import { supabase } from "../../supabaseClient.js";
import { useToast } from "../../components/ToastContext.jsx";
import TranslatedText from "../../components/TranslatedText.jsx";
import { checkRateLimit, rateLimitMessage } from "../../lib/rateLimit.js";
import { runOrEnqueue } from "../../lib/offlineActions.js";
import { recordFeedEvent } from "../../lib/feedEvents.js";

function isValidAuthUserId(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  if (
    value.startsWith("@") ||
    (value.includes("@") && value.includes("."))
  ) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

const REACTIONS = [
  { id: "like", label: "👍", title: "J’aime" },
];

/* =========================================================
   1. POLL CARD (Sondages)
   ========================================================= */

export const PollCard = memo(function PollCard({ postId, user_id }) {
  const { showToast } = useToast();

  const [poll, setPoll] = useState(null);
  const [rows, setRows] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const [votersData, setVotersData] = useState([]);
  const [loadingVoters, setLoadingVoters] = useState(false);

  const load = useCallback(async () => {
    if (!postId) {
      setPoll(null);
      setRows([]);
      setMyVote(null);
      return;
    }

    try {
      const { data: pollRow, error: pollError } = await supabase
        .from("polls")
        .select("id,question")
        .eq("post_id", postId)
        .maybeSingle();

      if (pollError) throw pollError;

      if (!pollRow) {
        setPoll(null);
        setRows([]);
        setMyVote(null);
        return;
      }

      const [resultsResponse, voteResponse] = await Promise.all([
        supabase
          .from("poll_results")
          .select("option_id,option_text,position,vote_count")
          .eq("poll_id", pollRow.id)
          .order("position"),
        isValidAuthUserId(user_id)
          ? supabase
              .from("poll_votes")
              .select("option_id")
              .eq("poll_id", pollRow.id)
              .eq("user_id", user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (resultsResponse.error) throw resultsResponse.error;
      if (voteResponse.error) throw voteResponse.error;

      setPoll(pollRow);
      setRows(resultsResponse.data || []);
      setMyVote(voteResponse.data?.option_id || null);
    } catch (error) {
      console.error("[BAARO] Erreur chargement sondage :", error);
    }
  }, [postId, user_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!poll?.id) return undefined;

    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "poll_votes",
          filter: `poll_id=eq.${poll.id}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll?.id, load]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.vote_count || 0), 0),
    [rows]
  );

  const vote = async (optionId) => {
    if (!isValidAuthUserId(user_id)) {
      showToast("Connectez-vous pour voter", "info");
      return;
    }

    if (busy || !poll?.id || !optionId) return;

    setBusy(true);

    try {
      const { error } = await supabase.rpc("vote_poll", {
        p_poll_id: poll.id,
        p_option_id: optionId,
      });

      if (error) throw error;

      setMyVote(optionId);
      await load();
      showToast("Vote enregistré !", "success");
    } catch (error) {
      console.error("[BAARO] Erreur vote sondage :", error);

      showToast(
        error?.message === "SOCIAL_RATE_LIMIT"
          ? "Trop d'actions, réessayez."
          : `Vote impossible : ${error?.message || "erreur inconnue"}`,
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const openVoters = async () => {
    if (!isValidAuthUserId(user_id)) {
      showToast("Connectez-vous pour voir les votants", "info");
      return;
    }

    if (!poll?.id) return;

    setShowVoters(true);
    setLoadingVoters(true);

    try {
      const { data, error } = await supabase.rpc("get_poll_voters", {
        p_poll_id: poll.id,
      });

      if (error) throw error;

      setVotersData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("[BAARO] Erreur chargement votants :", error);

      showToast(
        error?.message === "ACCESS_DENIED"
          ? "Accès refusé"
          : "Impossible de charger les votants",
        "error"
      );

      setShowVoters(false);
    } finally {
      setLoadingVoters(false);
    }
  };

  if (!poll) return null;

  return (
    <>
      <div
        className="rounded-xl border p-3"
        style={{
          borderColor: COLORS.borderTeal,
          background: COLORS.surface,
        }}
      >
        <TranslatedText
          text={poll.question}
          className="font-semibold text-sm mb-3"
          style={{ color: COLORS.ivory }}
        />

        <div className="space-y-2">
          {rows.map((row) => {
            const active = myVote === row.option_id;
            const count = Number(row.vote_count || 0);
            const percentage = total
              ? Math.round((count / total) * 100)
              : 0;

            return (
              <button
                key={row.option_id}
                type="button"
                disabled={busy}
                onClick={() => vote(row.option_id)}
                className="relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition disabled:opacity-60 active:scale-[0.98]"
                style={{
                  borderColor: active
                    ? COLORS.borderTeal
                    : COLORS.border,
                  color: COLORS.ivory,
                }}
              >
                <span
                  className="absolute inset-y-0 left-0 opacity-20"
                  style={{
                    width: `${percentage}%`,
                    background: COLORS.teal,
                  }}
                />

                <span className="relative flex items-center justify-between gap-3">
                  <span>
                    {row.option_text}
                    {active ? " ✓" : ""}
                  </span>

                  <span className="font-bold whitespace-nowrap">
                    {percentage}% · {count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <p
            className="text-[10px]"
            style={{ color: COLORS.muted }}
          >
            {total} vote{total > 1 ? "s" : ""} · Vous pouvez changer votre vote
          </p>

          {total > 0 && isValidAuthUserId(user_id) && (
            <button
              type="button"
              onClick={openVoters}
              className="text-[10px] font-bold hover:underline transition-colors"
              style={{ color: COLORS.teal }}
            >
              Voir les votants 👥
            </button>
          )}
        </div>
      </div>

      {showVoters && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowVoters(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Liste des votants"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.borderGold,
            }}
          >
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: COLORS.border }}
            >
              <h3
                className="font-bold text-sm"
                style={{ color: COLORS.ivory }}
              >
                Qui a voté ?
              </h3>

              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowVoters(false)}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: COLORS.muted }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingVoters ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: COLORS.muted }}
                >
                  Chargement...
                </div>
              ) : votersData.length === 0 ? (
                <div
                  className="text-center py-8 text-xs"
                  style={{ color: COLORS.muted }}
                >
                  Aucun votant
                </div>
              ) : (
                votersData.map((option) => {
                  const voters = Array.isArray(option.voters)
                    ? option.voters
                    : [];

                  return (
                    <div key={option.option_id}>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <p
                          className="font-bold text-xs"
                          style={{ color: COLORS.ivory }}
                        >
                          {option.option_text}
                        </p>

                        <span
                          className="text-[10px] whitespace-nowrap"
                          style={{ color: COLORS.muted }}
                        >
                          {voters.length} vote{voters.length > 1 ? "s" : ""}
                        </span>
                      </div>

                      {voters.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {voters.map((voter) => (
                            <div
                              key={voter.id}
                              className="flex items-center gap-2 px-2 py-1 rounded-lg border"
                              style={{
                                borderColor: COLORS.border,
                                background: COLORS.surface2,
                              }}
                            >
                              <div
                                className="w-6 h-6 rounded-full overflow-hidden border flex items-center justify-center text-[10px] font-bold"
                                style={{ borderColor: COLORS.borderGold }}
                              >
                                {voter.avatar_url ? (
                                  <img
                                    src={voter.avatar_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <span style={{ color: COLORS.gold }}>
                                    {voter.display_name?.charAt(0) || "?"}
                                  </span>
                                )}
                              </div>

                              <span
                                className="text-[10px]"
                                style={{ color: COLORS.ivory }}
                              >
                                {voter.display_name || "Membre"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p
                          className="text-[10px] italic"
                          style={{ color: COLORS.muted }}
                        >
                          Aucun vote pour cette option
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

/* =========================================================
   2. SOCIAL POST ENHANCEMENTS (Interactions & Notifications corrigées + Boutons alignés)
   ========================================================= */

export const SocialPostEnhancements = memo(
  function SocialPostEnhancements({ post, user_id, onLiked, onSaved, onShared }) {
    const { showToast } = useToast();

    const [reaction, setReaction] = useState(null);
    const [reactionCount, setReactionCount] = useState(0);
    const [saved, setSaved] = useState(false);
    const [shareCount, setShareCount] = useState(0);
    const [following, setFollowing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pop, setPop] = useState(false);

    // Fonction d'envoi de notification vers /api/social
    const sendNotification = async (interactionType) => {
      if (!post?.id || !isValidAuthUserId(user_id)) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        await fetch("/api/social", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "notify_interaction",
            content_type: "post",
            interaction_type: interactionType,
            target_id: post.id,
            recipient_id: post.author_id,
          }),
        });
      } catch (err) {
        console.warn("[post-notification]", err);
      }
    };

    const load = useCallback(async () => {
      if (!post?.id) return;

      try {
        const [
          likesResult,
          sharesResult,
          bookmarkResult,
          followResult,
        ] = await Promise.all([
          supabase
            .from("post_likes")
            .select("user_id")
            .eq("post_id", post.id),

          supabase
            .from("post_shares")
            .select("post_id", { count: "exact", head: true })
            .eq("post_id", post.id),

          isValidAuthUserId(user_id)
            ? supabase
                .from("post_bookmarks")
                .select("post_id")
                .eq("post_id", post.id)
                .eq("user_id", user_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          isValidAuthUserId(user_id) &&
          post.author_id &&
          post.author_id !== user_id
            ? supabase
                .from("follows")
                .select("followed_id")
                .eq("follower_id", user_id)
                .eq("followed_id", post.author_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (likesResult.error) throw likesResult.error;
        if (sharesResult.error) throw sharesResult.error;
        if (bookmarkResult.error) throw bookmarkResult.error;
        if (followResult.error) throw followResult.error;

        const likeRows = likesResult.data || [];

        setReactionCount(likeRows.length);
        setReaction(
          isValidAuthUserId(user_id) &&
            likeRows.some((row) => row.user_id === user_id)
            ? "like"
            : null
        );
        setSaved(!!bookmarkResult.data);
        setShareCount(sharesResult.count || 0);
        setFollowing(!!followResult.data);
      } catch (error) {
        console.error(
          "[BAARO] Erreur chargement interactions :",
          error
        );
      }
    }, [post?.id, post?.author_id, user_id]);

    useEffect(() => {
      load();
    }, [load]);

    useEffect(() => {
      if (!post?.id) return undefined;

      const channel = supabase
        .channel(`post-likes-${post.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "post_likes",
            filter: `post_id=eq.${post.id}`,
          },
          () => {
            load();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [post?.id, load]);

    const current = useMemo(
      () => REACTIONS.find((item) => item.id === reaction),
      [reaction]
    );

    const chooseReaction = async (value) => {
      if (!isValidAuthUserId(user_id)) {
        showToast("Connectez-vous pour réagir", "info");
        return;
      }

      if (!post?.id || busy) return;

      const isUnlike = reaction === "like" && value === "like";
      if (!isUnlike) {
        const limit = checkRateLimit("like", { max: 30, windowMs: 60_000 });
        if (!limit.allowed) {
          showToast(rateLimitMessage(limit.retryAfterSec), "error");
          return;
        }
      }

      setBusy(true);
      setPop(true);

      try {
        if (reaction === "like" && value === "like") {
          const result = await runOrEnqueue("unlike_post", { post_id: post.id });
          if (result?.offline) {
            showToast("Retrait du j'aime — sync au retour du réseau", "info");
          }
          setReaction(null);
          setReactionCount((count) => Math.max(0, count - 1));
          if (!result?.offline) await load();
          return;
        }

        const result = await runOrEnqueue("like_post", { post_id: post.id });
        if (result?.offline) {
          showToast("J'aime enregistré — sync au retour du réseau", "info");
        } else {
          await sendNotification("like");
          void recordFeedEvent(post.id, "like");
          await load();
        }

        setReaction("like");
        onLiked?.(post.id);
      } catch (error) {
        console.error("[BAARO] Erreur enregistrement like :", error);
        showToast("Impossible d’enregistrer la réaction", "error");
      } finally {
        setBusy(false);
        setTimeout(() => setPop(false), 300);
      }
    };

    const bookmark = async () => {
      if (!isValidAuthUserId(user_id)) {
        showToast("Connectez-vous pour enregistrer", "info");
        return;
      }

      if (!post?.id || busy) return;

      setBusy(true);

      try {
        if (saved) {
          const { error } = await supabase
            .from("post_bookmarks")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", user_id);

          if (error) throw error;

          setSaved(false);
        } else {
          const { error } = await supabase
            .from("post_bookmarks")
            .upsert(
              { post_id: post.id, user_id },
              { onConflict: "post_id,user_id" }
            );

          if (error) throw error;

          setSaved(true);
          onSaved?.(post.id);
        }
      } catch (error) {
        console.error("[BAARO] Erreur favori :", error);
        showToast("Impossible de modifier le favori", "error");
      } finally {
        setBusy(false);
      }
    };

    const share = async () => {
      if (!post?.id || busy) return;

      if (typeof window === "undefined") {
        showToast("Partage indisponible sur cet appareil", "error");
        return;
      }

      setBusy(true);

      try {
        const url = new URL(window.location.href);
        url.searchParams.set("post", post.id);

        const shareUrl = url.toString();
        let channelName = "copy";
        let shared = false;

        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          try {
            await navigator.share({
              title: "BAARO",
              text: post?.text?.slice(0, 120) || "Publication BAARO",
              url: shareUrl,
            });

            channelName = "native";
            shared = true;
          } catch (error) {
            if (error?.name === "AbortError") return;

            console.warn("[BAARO] Partage natif indisponible :", error);
          }
        }

        if (!shared) {
          if (
            typeof navigator !== "undefined" &&
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
          ) {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Lien copié dans le presse-papiers !", "success");
            shared = true;
          } else {
            showToast(
              "Le partage et la copie du lien ne sont pas disponibles dans ce navigateur.",
              "error"
            );
            return;
          }
        }

        if (isValidAuthUserId(user_id)) {
          const { error } = await supabase.from("post_shares").insert({
            post_id: post.id,
            id: user_id,
            channel: channelName,
          });

          if (error) {
            console.warn("[BAARO] Suivi du partage impossible :", error);
          }

          await sendNotification("share");
        }

        setShareCount((count) => count + 1);
        onShared?.(post.id);
      } catch (error) {
        console.error("[BAARO] Erreur partage :", error);
        showToast("Impossible de partager cette publication", "error");
      } finally {
        setBusy(false);
      }
    };

    const follow = async () => {
      if (!isValidAuthUserId(user_id)) {
        showToast("Connectez-vous pour suivre", "info");
        return;
      }

      if (!post?.author_id || user_id === post.author_id || busy) {
        return;
      }

      setBusy(true);

      const previousFollowing = following;
      setFollowing(!previousFollowing);

      try {
        const { data, error } = await supabase.rpc("toggle_follow", {
          p_target: post.author_id,
        });

        if (!error) {
          const nextFollowing =
            typeof data === "boolean" ? data : !previousFollowing;

          setFollowing(nextFollowing);

          showToast(
            nextFollowing
              ? "Vous suivez maintenant ce compte"
              : "Vous ne suivez plus ce compte",
            "success"
          );

          if (nextFollowing) {
            await sendNotification("follow");
          }

          return;
        }

        if (previousFollowing) {
          const { error: deleteError } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", user_id)
            .eq("followed_id", post.author_id);

          if (deleteError) throw deleteError;

          setFollowing(false);
          showToast("Vous ne suivez plus ce compte", "success");
        } else {
          const { error: upsertError } = await supabase
            .from("follows")
            .upsert(
              {
                follower_id: user_id,
                followed_id: post.author_id,
                status: "accepted",
                is_friend: false,
              },
              { onConflict: "follower_id,followed_id" }
            );

          if (upsertError) throw upsertError;

          setFollowing(true);
          showToast("Vous suivez maintenant ce compte", "success");

          await sendNotification("follow");
        }
      } catch (error) {
        console.error("[BAARO] Erreur abonnement :", error);
        setFollowing(previousFollowing);

        showToast(
          `Abonnement impossible : ${error?.message || "erreur inconnue"}`,
          "error"
        );
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex items-center justify-between w-full gap-2 pt-1">
        {post?.author_id && post.author_id !== user_id ? (
          <button
            type="button"
            onClick={follow}
            disabled={busy}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 disabled:opacity-50"
            style={{
              borderColor: following ? COLORS.borderTeal : COLORS.border,
              color: following ? COLORS.teal : COLORS.muted,
              background: COLORS.surface2,
            }}
          >
            {following ? <Check size={14} /> : <UserPlus size={14} />}
            <span>{following ? "Abonné" : "Suivre"}</span>
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => chooseReaction("like")}
            disabled={busy}
            aria-pressed={reaction === "like"}
            aria-label={reaction === "like" ? "Retirer mon J’aime" : "J’aime"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all duration-200 active:scale-95 disabled:opacity-50"
            style={{
              borderColor: COLORS.border,
              color: current ? COLORS.ivory : COLORS.muted,
              background: COLORS.surface2,
            }}
          >
            {/* MODIFICATION : le pouce reste en scale-125 s'il est liké */}
            <span
              className={`inline-block transition-transform duration-300 ${
                pop ? "scale-150" : reaction === "like" ? "scale-125" : "scale-100"
              }`}
            >
              {current?.label || "👍"}
            </span>

            {/* Bonus : le texte reste aussi en gras si liké, pour une meilleure cohérence visuelle */}
            <span
              className={`transition-all duration-300 ${
                pop ? "scale-110 font-bold" : reaction === "like" ? "font-bold" : "scale-100"
              }`}
            >
              {reactionCount || "J’aime"}
            </span>
          </button>

          <button
            type="button"
            onClick={bookmark}
            disabled={busy}
            aria-label={saved ? "Retirer des favoris" : "Enregistrer"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all active:scale-95 disabled:opacity-50"
            style={{
              borderColor: COLORS.border,
              color: saved ? COLORS.gold : COLORS.muted,
              background: COLORS.surface2,
            }}
          >
            <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            <span className="hidden sm:inline">
              {saved ? "Enregistré" : "Favori"}
            </span>
          </button>

          <button
            type="button"
            onClick={share}
            disabled={busy}
            aria-label="Partager cette publication"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all active:scale-95 disabled:opacity-50"
            style={{
              borderColor: COLORS.border,
              color: COLORS.muted,
              background: COLORS.surface2,
            }}
          >
            <Share2 size={14} />
            <span>{shareCount > 0 ? shareCount : "Partager"}</span>
          </button>
        </div>
      </div>
    );
  }
);

/* =========================================================
   3. SOCIAL SUGGESTIONS (Suggestions de comptes)
   ========================================================= */

export const SocialSuggestions = memo(
  function SocialSuggestions({ user_id, onOpenProfile }) {
    const { showToast } = useToast();

    const [items, setItems] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const loadSuggestions = useCallback(async () => {
      if (!isValidAuthUserId(user_id)) {
        setItems([]);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_social_suggestions", {
          p_limit: 6,
        });

        if (error) throw error;

        setItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("[BAARO] Erreur chargement suggestions :", error);
        setItems([]);
      }
    }, [user_id]);

    useEffect(() => {
      loadSuggestions();
    }, [loadSuggestions]);

    const follow = async (item) => {
      const target = item?.id;

      if (
        !isValidAuthUserId(user_id) ||
        !isValidAuthUserId(target) ||
        target === user_id
      ) {
        return;
      }

      if (busyId) return;

      setBusyId(target);

      try {
        const { data, error } = await supabase.rpc("toggle_follow", {
          p_target: target,
        });

        if (error) {
          const functionMissing =
            error.code === "PGRST202" || error.code === "42883";
          if (!functionMissing) throw error;

          const { error: upsertError } = await supabase.from("follows").upsert(
            {
              follower_id: user_id,
              followed_id: target,
              status: "accepted",
              is_friend: false,
            },
            { onConflict: "follower_id,followed_id" }
          );

          if (upsertError) throw upsertError;
        } else if (data === false) {
          const { error: againError } = await supabase.rpc("toggle_follow", {
            p_target: target,
          });
          if (againError) throw againError;
        }

        const remaining = items.filter((entry) => entry.id !== target);
        setItems(remaining);
        showToast("Abonnement ajouté", "success");

        if (remaining.length < 3) loadSuggestions();
      } catch (error) {
        console.error("[BAARO] Erreur suggestion follow :", error);

        showToast(
          error?.message === "SOCIAL_RATE_LIMIT"
            ? "Trop d'abonnements d'affilée, réessayez dans un instant."
            : `Abonnement impossible : ${error?.message || "erreur inconnue"}`,
          "error"
        );
      } finally {
        setBusyId(null);
      }
    };

    if (!items.length) return null;

    return (
      <section
        className="glass-card rounded-2xl p-4 border"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} style={{ color: COLORS.gold }} />

          <h3 className="font-bold text-sm" style={{ color: COLORS.ivory }}>
            Comptes à découvrir
          </h3>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="min-w-[160px] rounded-xl border p-3 transition-all hover:border-amber-400/50"
              style={{
                borderColor: COLORS.border,
                background: COLORS.surface,
              }}
            >
              <button
                type="button"
                onClick={() => onOpenProfile?.(item.id)}
                className="flex items-center gap-2 text-left w-full"
              >
                <div
                  className="w-9 h-9 rounded-full overflow-hidden border flex items-center justify-center shrink-0"
                  style={{ borderColor: COLORS.borderGold }}
                >
                  {item.avatar_url ? (
                    <img
                      src={item.avatar_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span style={{ color: COLORS.gold }}>
                      {item.full_name?.charAt(0) || "?"}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className="font-semibold text-xs truncate"
                    style={{ color: COLORS.ivory }}
                  >
                    {item.full_name || "Membre"}
                  </p>

                  <p
                    className="text-[10px] truncate"
                    style={{ color: COLORS.muted }}
                  >
                    {item.handle || ""}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => follow(item)}
                disabled={busyId !== null}
                className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: COLORS.gold,
                  color: COLORS.bg,
                }}
              >
                {busyId === item.id ? "…" : "Suivre"}
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  }
);
