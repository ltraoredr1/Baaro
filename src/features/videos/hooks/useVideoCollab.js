import { useState, useCallback } from "react";
import { useToast } from "../../../components/ToastContext.jsx";

/**
 * Duo / Stitch / Reply vidéo.
 * Prépare le contexte collab puis ouvre le composeur via onOpenComposer.
 */
export function useVideoCollab({ onOpenComposer, soundPicker }) {
  const { showToast } = useToast();
  const [collab, setCollab] = useState(null);

  const startStitch = useCallback(
    (video) => {
      if (!video?.id) return;
      const payload = {
        mode: "stitch",
        sourceVideoId: video.id,
        sourceTitle: video.title,
        sourceUrl: video.video_url,
        sourceThumb: video.thumbnail_url,
        stitchStartMs: 0,
        stitchEndMs: 5000,
        sound: video.sound_id
          ? {
              id: video.sound_id,
              title: video.sound_title || "Son original",
              audio_url: video.sound_url || video.video_url,
            }
          : null,
      };
      setCollab(payload);
      if (payload.sound && soundPicker?.chooseSound) {
        soundPicker.chooseSound(payload.sound);
      }
      showToast("Stitch : choisis ton extrait puis filme la suite", "info");
      onOpenComposer?.(payload);
    },
    [onOpenComposer, soundPicker, showToast],
  );

  const startDuo = useCallback(
    (video) => {
      if (!video?.id) return;
      const payload = {
        mode: "duo",
        sourceVideoId: video.id,
        sourceTitle: video.title,
        sourceUrl: video.video_url,
        sourceThumb: video.thumbnail_url,
        sound: video.sound_id
          ? {
              id: video.sound_id,
              title: video.sound_title || "Son original",
              audio_url: video.sound_url || video.video_url,
            }
          : null,
      };
      setCollab(payload);
      if (payload.sound && soundPicker?.chooseSound) {
        soundPicker.chooseSound(payload.sound);
      }
      showToast("Duo : filme à côté de cette vidéo", "info");
      onOpenComposer?.(payload);
    },
    [onOpenComposer, soundPicker, showToast],
  );

  const startReply = useCallback(
    (ctx) => {
      if (!ctx?.replyToCommentId) return;
      const payload = {
        mode: "reply",
        replyToCommentId: ctx.replyToCommentId,
        replyToVideoId: ctx.replyToVideoId,
        commentPreview: ctx.commentPreview,
        commentAuthor: ctx.commentAuthor,
      };
      setCollab(payload);
      showToast(
        `Réponse vidéo à @${(ctx.commentAuthor || "membre").replace(/^@/, "")}`,
        "info",
      );
      onOpenComposer?.(payload);
    },
    [onOpenComposer, showToast],
  );

  const setStitchRange = (startMs, endMs) => {
    setCollab((prev) =>
      prev?.mode === "stitch"
        ? { ...prev, stitchStartMs: startMs, stitchEndMs: endMs }
        : prev,
    );
  };

  const clearCollab = () => setCollab(null);

  return {
    collab,
    setCollab,
    startStitch,
    startDuo,
    startReply,
    setStitchRange,
    clearCollab,
  };
}
