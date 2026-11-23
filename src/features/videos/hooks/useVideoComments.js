import { useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";
import { API_BASE } from "../../../config.js";

/**
 * Commentaires vidéo + réponse en vidéo.
 * onReplyWithVideo(comment, videoId) → ouvre le composeur en mode reply.
 */
export function useVideoComments({ user, setVideos, onRewardPoints, onReplyWithVideo }) {
  const { showToast, showPointsReward } = useToast();

  const [showComments, setShowComments] = useState(null);
  const [comments, setComments] = useState({});
  const [newComment, setNewComment] = useState("");

  const openComments = async (videoId) => {
    setShowComments(videoId);

    const { data, error } = await supabase
      .from("video_comments")
      .select(
        "id, content, created_at, has_video_reply, parent_comment_id, author_id, profiles:author_id(display_name, handle, flag, avatar_url)",
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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Session expirée. Reconnectez-vous pour commenter.");
      }

      const response = await fetch(`${API_BASE}/api/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "comment",
          video_id: videoId,
          text,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.comment_id) {
        throw new Error(result.error || "Impossible d'enregistrer le commentaire.");
      }

      setNewComment("");
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

  const replyWithVideo = (comment) => {
    if (!showComments || !comment?.id) return;
    onReplyWithVideo?.({
      mode: "reply",
      replyToCommentId: comment.id,
      replyToVideoId: showComments,
      commentPreview: comment.content,
      commentAuthor: comment.profiles?.handle || comment.profiles?.display_name,
    });
    setShowComments(null);
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
    replyWithVideo,
  };
}
