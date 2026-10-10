import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";

// Feuille de commentaires : ouverture, lecture, envoi.
export function useVideoComments({ user, setVideos, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();

  const [showComments, setShowComments] = useState(null);
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState("");

  const openComments = async (videoId) => {
    setShowComments(videoId);

    const { data, error } = await supabase
      .from("video_comments")
      .select(
        "id, content, created_at, profiles:author_id(display_name, handle, flag, avatar_url)",
      )
      .eq("video_id", videoId)
      .order("created_at", { ascending: true });

    if (error) {
      showToast("Impossible de charger les commentaires.", "error");
      return;
    }

    setComments((prev) => ({ ...prev, [videoId]: data || [] }));
  };

  const sendComment = async () => {
    if (!user || !showComments || !newComment.trim()) return;

    const text = newComment.trim();

    try {
      const { data, error } = await supabase
        .from("video_comments")
        .insert({
          video_id: showComments,
          author_id: user.id,
          content: text,
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewComment("");
      await openComments(showComments);

      setVideos((prev) =>
        prev.map((video) =>
          video.id === showComments
            ? {
                ...video,
                comments_count: Number(video.comments_count || 0) + 1,
              }
            : video,
        ),
      );

      onRewardPoints?.("comment_video", "Commentaire", data?.id);
      showPointsReward?.(2, "Commentaire");
    } catch (error) {
      console.error(error);
      showToast("Impossible d'envoyer le commentaire.", "error");
    }
  };

  const closeComments = () => setShowComments(null);

  return {
    showComments,
    comments,
    newComment,
    setNewComment,
    openComments,
    closeComments,
    sendComment,
  };
}
