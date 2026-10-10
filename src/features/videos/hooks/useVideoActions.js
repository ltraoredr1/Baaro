import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";
import { insertVideo } from "../utils/videosApi.js";

// Actions sur une vidéo : like, partage, repost, suppression.
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

    setLikedMap((prev) => ({ ...prev, [videoId]: !wasLiked }));
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
          .insert({ video_id: videoId, user_id: user.id });

        if (error) throw error;

        onRewardPoints?.("like_video", "Vidéo aimée", videoId);
        showPointsReward?.(2, "Vidéo aimée");
      }
    } catch (error) {
      console.error(error);
      setLikedMap((prev) => ({ ...prev, [videoId]: wasLiked }));
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
    const url = `${window.location.origin}?video=${encodeURIComponent(video.id)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: video.title || "Vidéo BAARO",
          text: "Regarde cette vidéo sur BAARO",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareId(video.id);
        showToast("Lien copié !", "success");
        setTimeout(() => setShareId(null), 1800);
      }
    } catch {
      // User cancelled the native share sheet.
    }
  };

  const handleRepost = async (video) => {
    if (!user) {
      showToast("Connecte-toi pour reposter.", "error");
      return;
    }

    const cleanHandle = video.profiles?.handle?.replace(/^@/, "") || "membre";

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
          original_author_id: video.author_id,
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

      onRewardPoints?.("repost_video", "Repost", data?.id);
      showPointsReward?.(5, "Repost");
      showToast("Vidéo repostée !", "success");
      loadVideos();
    } catch (error) {
      console.error(error);
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

      setVideos((prev) => prev.filter((video) => video.id !== videoId));
      delete videoRefs.current[videoId];
      showToast("Vidéo supprimée.", "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de supprimer la vidéo.", "error");
    }
  };

  return { handleLike, handleShare, handleRepost, handleDelete, shareId };
}
