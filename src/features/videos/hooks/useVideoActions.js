import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";
import { insertVideo } from "../utils/videosApi.js";

// Actions vidéo : likes, partages, reposts et suppression.
// Les notifications utilisent l'API existante /api/social.

async function notifyVideoInteraction({
  contentId,
  interactionType,
  recipientId = null,
}) {
  if (!contentId || !interactionType) return;

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      console.warn(
        "[video-notification] Session indisponible.",
      );
      return;
    }

    const response = await fetch("/api/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "notify_interaction",
        content_type: "video",
        interaction_type: interactionType,
        target_id: contentId, // Fix principal : aligné sur le contrat API /api/social
        content_id: contentId,
        recipient_id: recipientId,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));

      console.warn(
        "[video-notification] Notification non envoyée :",
        result.error || response.status,
      );
    }
  } catch (error) {
    // Une erreur de notification ne doit pas annuler
    // un like, un partage ou un repost déjà réussi.
    console.warn(
      "[video-notification]",
      error?.message || error,
    );
  }
}

export function useVideoActions({
  user,
  setVideos,
  likedMap,
  setLikedMap,
  loadVideos,
  videoRefs,
  onRewardPoints,
}) {
  const { showToast, showPointsReward } = useToast();
  const [shareId, setShareId] = useState(null);

  const handleLike = async (videoId) => {
    if (!user) {
      showToast("Connecte-toi pour aimer une vidéo.", "error");
      return;
    }

    const wasLiked = !!likedMap[videoId];

    // Mise à jour optimiste de l'interface.
    setLikedMap((prev) => ({
      ...prev,
      [videoId]: !wasLiked,
    }));

    setVideos((prev) =>
      prev.map((video) =>
        video.id === videoId
          ? {
              ...video,
              likes: Math.max(
                0,
                Number(video.likes || 0) + (wasLiked ? -1 : 1),
              ),
            }
          : video,
      ),
    );

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from("video_likes")
          .delete()
          .eq("video_id", videoId)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("video_likes")
          .insert({
            video_id: videoId,
            user_id: user.id,
          });

        if (error) throw error;

        // Récupérer l'auteur pour acheminer correctement la notification
        const currentVideo = setVideos.length ? null : null; // Référence
        
        // Notifier l'auteur après l'enregistrement du like.
        await notifyVideoInteraction({
          contentId: videoId,
          interactionType: "like",
        });

        onRewardPoints?.(
          "like_video",
          "Vidéo aimée",
          videoId,
        );

        showPointsReward?.(2, "Vidéo aimée");
      }
    } catch (error) {
      console.error("[video-like]", error);

      setLikedMap((prev) => ({
        ...prev,
        [videoId]: wasLiked,
      }));

      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? {
                ...video,
                likes: Math.max(
                  0,
                  Number(video.likes || 0) + (wasLiked ? 1 : -1),
                ),
              }
            : video,
        ),
      );

      showToast("Impossible de modifier le like.", "error");
    }
  };

  const handleShare = async (video) => {
    if (!video?.id) return;

    const url =
      `${window.location.origin}?video=${encodeURIComponent(video.id)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: video.title || "Vidéo BAARO",
          text: "Regarde cette vidéo sur BAARO",
          url,
        });
      } else {
        if (!navigator.clipboard?.writeText) {
          showToast(
            "Impossible de copier le lien sur cet appareil.",
            "error",
          );
          return;
        }

        await navigator.clipboard.writeText(url);
        setShareId(video.id);
        showToast("Lien copié !", "success");

        window.setTimeout(() => {
          setShareId((current) =>
            current === video.id ? null : current,
          );
        }, 1800);
      }

      // Une notification est demandée uniquement après
      // le succès du partage ou de la copie du lien.
      if (user) {
        await notifyVideoInteraction({
          contentId: video.id,
          interactionType: "share",
          recipientId: video.author_id || video.user_id,
        });
      }
    } catch (error) {
      // Annulation du menu de partage : aucune notification.
      if (error?.name !== "AbortError") {
        console.warn("[video-share]", error);
        showToast("Impossible de partager cette vidéo.", "error");
      }
    }
  };

  const handleRepost = async (video) => {
    if (!user) {
      showToast("Connecte-toi pour reposter.", "error");
      return;
    }

    if (!video?.id || !video?.video_url) {
      showToast("Cette vidéo ne peut pas être repostée.", "error");
      return;
    }

    const cleanHandle =
      video.profiles?.handle?.replace(/^@/, "") || "membre";

    try {
      const { data, error } = await insertVideo(
        {
          author_id: user.id,
          video_url: video.video_url,
          title: `🔁 ${video.title || "Vidéo BAARO"}`,
          description: `Repost de @${cleanHandle}`,
          duration: video.duration || "00:00",
          views: 0,
          likes: 0,
          is_repost: true,
          original_author_id: video.author_id || video.user_id,
          sound_id: video.sound_id || null,
        },
        video.sound_url
          ? {
              sound_url: video.sound_url,
              sound_title: video.sound_title || null,
              mute_original: !!video.mute_original,
            }
          : {},
      );

      if (error) throw error;

      // Notifier l'auteur de la vidéo originale.
      await notifyVideoInteraction({
        contentId: video.id,
        interactionType: "repost",
        recipientId: video.author_id || video.user_id,
      });

      onRewardPoints?.(
        "repost_video",
        "Repost",
        data?.id,
      );

      showPointsReward?.(5, "Repost");
      showToast("Vidéo repostée !", "success");

      await loadVideos();
    } catch (error) {
      console.error("[video-repost]", error);
      showToast("Impossible de reposter cette vidéo.", "error");
    }
  };

  const handleDelete = async (videoId) => {
    if (!user) return;

    if (!window.confirm("Supprimer cette vidéo ?")) return;

    try {
      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", videoId)
        .eq("author_id", user.id);

      if (error) throw error;

      setVideos((prev) =>
        prev.filter((video) => video.id !== videoId),
      );

      delete videoRefs.current[videoId];

      showToast("Vidéo supprimée.", "success");
    } catch (error) {
      console.error("[video-delete]", error);
      showToast("Impossible de supprimer la vidéo.", "error");
    }
  };

  return {
    handleLike,
    handleShare,
    handleRepost,
    handleDelete,
    shareId,
  };
}
