
import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";

async function notifyVideoComment(videoId) {
  if (!videoId) return;

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) return;

    const response = await fetch("/api/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "notify_interaction",
        content_type: "video",
        interaction_type: "comment",
        content_id: videoId,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      console.warn(
        "[video-comment-notification]",
        result.error || response.status,
      );
    }
  } catch (error) {
    // Une erreur de notification ne doit pas annuler le commentaire.
    console.warn(
      "[video-comment-notification]",
      error?.message || error,
    );
  }
}

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

    const videoId = showComments;
    const text = newComment.trim();

    try {
      const { data, error } = await supabase
        .from("video_comments")
        .insert({
          video_id: videoId,
          author_id: user.id,
          content: text,
        })
        .select("id")
        .single();

      if (error) throw error;

      setNewComment("");

      // Le commentaire est enregistré avant l'envoi de la notification.
      await notifyVideoComment(videoId);
      await openComments(videoId);

      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
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
      console.error("[video-comment]", error);
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
