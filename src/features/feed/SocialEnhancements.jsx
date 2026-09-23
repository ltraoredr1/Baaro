import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Check, Share2, UserPlus, X, Zap } from "lucide-react";
import { COLORS } from "../../theme.js";
import { supabase } from "../../supabaseClient.js";
import { useToast } from "../../components/ToastContext.jsx";

const REACTIONS = [
  { id: "like", label: "👍", title: "J’aime" },
  { id: "love", label: "❤️", title: "J’adore" },
  { id: "laugh", label: "😂", title: "Drôle" },
  { id: "wow", label: "😮", title: "Waouh" },
  { id: "sad", label: "😢", title: "Triste" },
  { id: "angry", label: "😡", title: "En colère" },
  { id: "support", label: "🤝", title: "Soutien" },
];

export function SocialPostEnhancements({ post, userId }) {
  const { showToast } = useToast();

  const [reaction, setReaction] = useState(null);
  const [reactionCount, setReactionCount] = useState(0);
  const [picker, setPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareCount, setShareCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(false);

  const load = useCallback(async () => {
    if (!post?.id) return;

    try {
      const [
        likesResult,
        sharesResult,
        bookmarkResult,
        followResult,
      ] = await Promise.all([
        /*
         * SOURCE UNIQUE DES LIKES
         * ------------------------
         * post_likes.post_id -> posts.id
         * post_likes.id       -> auth.users.id
         *
         * On ne lit plus post_reactions.
         */
        supabase
          .from("post_likes")
          .select("id")
          .eq("post_id", post.id),

        supabase
          .from("post_shares")
          .select("post_id", { count: "exact", head: true })
          .eq("post_id", post.id),

        userId
          ? supabase
              .from("post_bookmarks")
              .select("post_id")
              .eq("post_id", post.id)
              .eq("id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        userId && post.author_id !== userId
          ? supabase
              .from("follows")
              .select("followed_id")
              .eq("follower_id", userId)
              .eq("followed_id", post.author_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (likesResult.error) {
        console.error(
          "[BAARO] Erreur chargement post_likes:",
          likesResult.error
        );
      }

      if (sharesResult.error) {
        console.error(
          "[BAARO] Erreur chargement partages:",
          sharesResult.error
        );
      }

      if (bookmarkResult.error) {
        console.error(
          "[BAARO] Erreur chargement favori:",
          bookmarkResult.error
        );
      }

      if (followResult.error) {
        console.error(
          "[BAARO] Erreur chargement abonnement:",
          followResult.error
        );
      }

      const likeRows = likesResult.data || [];

      /*
       * Le compteur affiché est calculé à partir de la table
       * qui constitue la source réelle des likes.
       */
      setReactionCount(likeRows.length);

      /*
       * Dans post_likes, l'identifiant utilisateur est `id`.
       * Il correspond à auth.users.id.
       *
       * post_likes ne stocke pas plusieurs types de réactions :
       * le fait d'être présent dans la table signifie simplement
       * que l'utilisateur a aimé le post.
       */
      setReaction(
        userId && likeRows.some((row) => row.id === userId)
          ? "like"
          : null
      );

      setSaved(!!bookmarkResult.data);
      setShareCount(sharesResult.count || 0);
      setFollowing(!!followResult.data);
    } catch (error) {
      console.error(
        "[BAARO] Erreur chargement interactions:",
        error
      );
    }
  }, [post?.id, post?.author_id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Realtime :
   * on écoute directement post_likes.
   *
   * Ainsi, si un autre utilisateur aime ou retire son like,
   * le compteur est immédiatement recalculé.
   */
  useEffect(() => {
    if (!post?.id) return;

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

  /*
   * LIKE / REACTION
   *
   * post_likes = source de vérité.
   *
   * Un utilisateur possède au maximum une ligne :
   *   (post_id, id)
   */
  const chooseReaction = async (value) => {
    if (!userId) {
      showToast("Connectez-vous pour réagir", "info");
      return;
    }

    if (!post?.id || busy) return;

    /*
     * post_likes représente un LIKE.
     * Les anciennes réactions love/laugh/etc. ne peuvent donc
     * pas être conservées comme type dans cette table.
     *
     * Toute réaction sélectionnée est donc enregistrée comme LIKE.
     */
    const nextIsLiked = value !== "like" || reaction !== "like";

    setBusy(true);
    setPop(true);

    setTimeout(() => {
      setPop(false);
    }, 300);

    try {
      /*
       * Si l'utilisateur clique à nouveau sur le LIKE actuel :
       * suppression du like.
       */
      if (reaction === "like" && value === "like") {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("id", userId);

        if (error) throw error;

        setReaction(null);
        setReactionCount((count) => Math.max(0, count - 1));

        /*
         * Le compteur posts.likes_count est maintenu par la
         * base / trigger. On recharge après l'opération afin
         * d'éviter une divergence entre UI et DB.
         */
        await load();

        setPicker(false);
        return;
      }

      /*
       * Si l'utilisateur choisit n'importe quelle réaction,
       * on utilise le système canonique post_likes.
       */
      const { error } = await supabase
        .from("post_likes")
        .upsert(
          {
            post_id: post.id,
            id: userId,
          },
          {
            onConflict: "post_id,id",
          }
        );

      if (error) throw error;

      /*
       * Mise à jour immédiate de l'interface.
       * Si le post était déjà aimé, le compteur ne doit pas
       * être incrémenté une deuxième fois.
       */
      if (reaction !== "like") {
        setReactionCount((count) => count + 1);
      }

      setReaction("like");

      /*
       * Recharge la valeur réelle depuis post_likes.
       */
      await load();

      setPicker(false);
    } catch (error) {
      console.error(
        "[BAARO] Erreur enregistrement like:",
        error
      );

      showToast(
        "Impossible d’enregistrer la réaction",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const bookmark = async () => {
    if (!userId) {
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
          .eq("id", userId);

        if (error) throw error;

        setSaved(false);
      } else {
        const { error } = await supabase
          .from("post_bookmarks")
          .upsert(
            {
              post_id: post.id,
              id: userId,
            },
            {
              onConflict: "post_id,id",
            }
          );

        if (error) throw error;

        setSaved(true);
      }
    } catch (error) {
      console.error(
        "[BAARO] Erreur favori:",
        error
      );

      showToast(
        "Impossible de modifier le favori",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!post?.id || busy) return;

    setBusy(true);

    try {
      const { error } = await supabase
        .from("post_shares")
        .insert({
          post_id: post.id,
          id: userId || null,
        });

      if (error) throw error;

      setShareCount((count) => count + 1);

      /*
       * Partage natif si disponible.
       */
      if (navigator?.share) {
        try {
          await navigator.share({
            title: post?.title || "BAARO",
            text: post?.text || post?.content || "",
            url: window.location.href,
          });
        } catch {
          /*
           * L'utilisateur peut annuler le partage natif.
           * Le partage DB reste enregistré.
           */
        }
      } else if (navigator?.clipboard) {
        try {
          await navigator.clipboard.writeText(
            window.location.href
          );

          showToast(
            "Lien copié",
            "success"
          );
        } catch {
          showToast(
            "Partage enregistré",
            "success"
          );
        }
      } else {
        showToast(
          "Partage enregistré",
          "success"
        );
      }
    } catch (error) {
      console.error(
        "[BAARO] Erreur partage:",
        error
      );

      showToast(
        "Impossible de partager cette publication",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const follow = async () => {
    if (!userId) {
      showToast("Connectez-vous pour vous abonner", "info");
      return;
    }

    if (!post?.author_id || post.author_id === userId || busy) {
      return;
    }

    setBusy(true);

    try {
      if (following) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("followed_id", post.author_id);

        if (error) throw error;

        setFollowing(false);
      } else {
        const { error } = await supabase
          .from("follows")
          .upsert(
            {
              follower_id: userId,
              followed_id: post.author_id,
              status: "accepted",
              is_friend: false,
            },
            {
              onConflict: "follower_id,followed_id",
            }
          );

        if (error) throw error;

        setFollowing(true);
      }
    } catch (error) {
      console.error(
        "[BAARO] Erreur abonnement:",
        error
      );

      showToast(
        "Impossible de modifier l’abonnement",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="social-post-enhancements"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {/* =====================================================
          LIKE / REACTION
          ===================================================== */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() =>
            chooseReaction(
              reaction === "like" ? "like" : "like"
            )
          }
          disabled={busy}
          title={
            current?.title ||
            "J’aime"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            border: 0,
            background: "transparent",
            cursor: busy ? "wait" : "pointer",
            padding: "6px 8px",
            borderRadius: 8,
          }}
        >
          <span
            style={{
              fontSize: 18,
              transform: pop ? "scale(1.25)" : "scale(1)",
              transition: "transform 0.15s ease",
            }}
          >
            {current?.label || "👍"}
          </span>

          <span>
            {reactionCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPicker((value) => !value)}
          disabled={busy}
          title="Réactions"
          style={{
            border: 0,
            background: "transparent",
            cursor: busy ? "wait" : "pointer",
            padding: "4px",
          }}
        >
          <Zap size={15} />
        </button>

        {picker && (
          <div
            style={{
              position: "absolute",
              zIndex: 50,
              left: 0,
              bottom: "calc(100% + 6px)",
              display: "flex",
              gap: 4,
              padding: 7,
              borderRadius: 12,
              background: COLORS?.surface || "#fff",
              boxShadow:
                "0 6px 24px rgba(0,0,0,.18)",
            }}
          >
            {REACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.title}
                onClick={() =>
                  chooseReaction(item.id)
                }
                disabled={busy}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: busy ? "wait" : "pointer",
                  fontSize: 20,
                  padding: 5,
                  borderRadius: 8,
                }}
              >
                {item.label}
              </button>
            ))}

            <button
              type="button"
              title="Fermer"
              onClick={() => setPicker(false)}
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                padding: 5,
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* =====================================================
          BOOKMARK
          ===================================================== */}
      <button
        type="button"
        onClick={bookmark}
        disabled={busy}
        title={
          saved
            ? "Retirer des favoris"
            : "Enregistrer"
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          border: 0,
          background: "transparent",
          cursor: busy ? "wait" : "pointer",
          padding: "6px 8px",
        }}
      >
        {saved ? (
          <Check size={18} />
        ) : (
          <Bookmark size={18} />
        )}
      </button>

      {/* =====================================================
          SHARE
          ===================================================== */}
      <button
        type="button"
        onClick={share}
        disabled={busy}
        title="Partager"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          border: 0,
          background: "transparent",
          cursor: busy ? "wait" : "pointer",
          padding: "6px 8px",
        }}
      >
        <Share2 size={18} />
        <span>
          {shareCount}
        </span>
      </button>

      {/* =====================================================
          FOLLOW
          ===================================================== */}
      {userId &&
        post?.author_id &&
        post.author_id !== userId && (
          <button
            type="button"
            onClick={follow}
            disabled={busy}
            title={
              following
                ? "Ne plus suivre"
                : "Suivre"
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: 0,
              background: "transparent",
              cursor: busy ? "wait" : "pointer",
              padding: "6px 8px",
            }}
          >
            {following ? (
              <Check size={18} />
            ) : (
              <UserPlus size={18} />
            )}

            <span>
              {following
                ? "Suivi"
                : "Suivre"}
            </span>
          </button>
        )}
    </div>
  );
}
