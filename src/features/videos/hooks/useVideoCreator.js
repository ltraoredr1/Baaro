import { useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ToastContext.jsx";
import {
  discardUploadedMedia,
  uploadExternalMedia,
} from "../../../lib/externalMedia.js";
import { generateAIImage } from "../../../lib/geminiAI.js";
import {
  looksLikeVideo,
  uploadLargeVideo,
} from "../../../services/mediaService.js";
import { supabase } from "../../../supabaseClient.js";
import {
  buildCollabPayload,
  registerVideoHashtags,
} from "../../../lib/videoEngagement.js";
import { MAX_PHOTOS } from "../constants.js";
import { withFilter } from "../filters/index.js";
import { formatTime } from "../utils/format.js";
import { insertVideo } from "../utils/videosApi.js";
import { renderVideoWithFilter } from "../utils/filterRender.js";
import {
  loadImage,
  makePhotoDrawer,
  makeTextDrawer,
  readDuration,
  renderToFile,
} from "../utils/videoRenderer.js";

async function generateGeminiVisual(promptText) {
  try {
    const file = await generateAIImage(
      `Création visuelle verticale 9:16 attrayante pour réseau social: ${promptText}`,
    );
    if (!file) return null;
    return { file, url: URL.createObjectURL(file) };
  } catch (error) {
    console.warn("Génération visuelle Gemini indisponible / repli local :", error);
    return null;
  }
}

/**
 * Composeur vidéo + collab (stitch / duo / reply) + hashtags.
 */
export function useVideoCreator({
  user,
  loadVideos,
  onRewardPoints,
  soundPicker,
  collab = null,
  onCollabConsumed,
  filter = null,
}) {
  const { showToast, showPointsReward } = useToast();
  const { selectedSound, muteOriginal, stopSoundPreview, resetSound } =
    soundPicker;

  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const selectedFile = selectedFiles[0] || null; // compat
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [createMode, setCreateMode] = useState("video");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoSeconds, setPhotoSeconds] = useState(3);
  const [textContent, setTextContent] = useState("");
  const [textTheme, setTextTheme] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [bakedAudio, setBakedAudio] = useState(false);
  const [generatedSeconds, setGeneratedSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filterRendering, setFilterRendering] = useState(false);
  // Étapes d'une publication : "uploading" (envoi du fichier) → "creating" (ligne vidéo)
  // → "metadata" (hashtags, réponse) → "done" (entièrement finalisée). null = au repos.
  const [publishStage, setPublishStage] = useState(null);

  const photoInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewAudioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Préremplir le titre si réponse / stitch / duo
  useEffect(() => {
    if (!collab?.mode || uploadTitle) return;
    if (collab.mode === "reply" && collab.commentAuthor) {
      setUploadTitle(
        `Réponse à @${String(collab.commentAuthor).replace(/^@/, "")}`,
      );
    } else if (collab.mode === "stitch" && collab.sourceTitle) {
      setUploadTitle(`Stitch · ${collab.sourceTitle}`);
    } else if (collab.mode === "duo" && collab.sourceTitle) {
      setUploadTitle(`Duo · ${collab.sourceTitle}`);
    }
  }, [collab, uploadTitle]);

  const handlePhotosSelected = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!incoming.length) {
      showToast("Sélectionne des photos.", "error");
      return;
    }
    setPhotoFiles((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (incoming.length > room)
        showToast(`${MAX_PHOTOS} photos maximum.`, "error");
      const added = incoming
        .filter((f) => f.size <= 15 * 1024 * 1024)
        .slice(0, Math.max(0, room))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
        }));
      return [...prev, ...added];
    });
  };

  const removePhoto = (id) => {
    setPhotoFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleGenerate = async () => {
    if (generating) return;
    const wantSound = !!selectedSound?.audio_url;
    let audioCtx = null;

    try {
      if (wantSound) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioCtx = new AC();
          audioCtx.resume?.().catch(() => {});
        }
      }

      stopSoundPreview();
      setGenerating(true);
      setGenerateProgress(0.1);

      let drawFrame;
      let totalMs;

      if (createMode === "photo") {
        if (!photoFiles.length) {
          showToast("Ajoute au moins une photo.", "error");
          setGenerating(false);
          return;
        }
        const images = await Promise.all(
          photoFiles.map((item) => loadImage(item.url)),
        );
        totalMs = images.length * photoSeconds * 1000;
        drawFrame = makePhotoDrawer(images, photoSeconds);
      } else {
        const text = textContent.trim();
        if (!text) {
          showToast("Écris ton texte.", "error");
          setGenerating(false);
          return;
        }

        setGenerateProgress(0.2);
        const geminiResult = await generateGeminiVisual(text);
        setGenerateProgress(0.5);

        if (geminiResult) {
          const aiImage = await loadImage(geminiResult.url);
          totalMs = 6000;
          drawFrame = makePhotoDrawer([aiImage], 6);
        } else {
          const words = text.split(/\s+/).length;
          totalMs = Math.min(15, Math.max(5, Math.ceil(words * 0.5))) * 1000;
          drawFrame = makeTextDrawer(text, textTheme);
        }
      }

      const file = await renderToFile({
        drawFrame: filter?.spec ? withFilter(drawFrame, filter.spec) : drawFrame,
        totalMs,
        audioUrl: wantSound ? selectedSound.audio_url : null,
        audioCtx,
        onProgress: (p) => setGenerateProgress(0.5 + p * 0.5),
      });

      handleFileSelected(file);
      setGenerated(true);
      setBakedAudio(wantSound);
      setGeneratedSeconds(Math.round(totalMs / 1000));
      showToast("Génération réussie !", "success");
    } catch (error) {
      console.error(error);
      showToast(
        `Création impossible : ${error.message || "erreur de rendu"}`,
        "error",
      );
    } finally {
      audioCtx?.close?.().catch(() => {});
      setGenerating(false);
      setGenerateProgress(0);
    }
  };

  const backToCreator = () => {
    selectedFiles.forEach((f) => {
      if (f._previewUrl) URL.revokeObjectURL(f._previewUrl);
    });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFiles([]);
    setPreviewUrl("");
    setGenerated(false);
    setBakedAudio(false);
  };

  const resetUpload = () => {
    resetSound();
    photoFiles.forEach((item) => URL.revokeObjectURL(item.url));
    setPhotoFiles([]);
    setTextContent("");
    setGenerated(false);
    setBakedAudio(false);
    selectedFiles.forEach((f) => {
      if (f._previewUrl) URL.revokeObjectURL(f._previewUrl);
    });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFiles([]);
    setPreviewUrl("");
    setUploadTitle("");
    setUploadDescription("");
    setUploadProgress(0);
    onCollabConsumed?.();
  };

  const handleFileSelected = (fileOrList) => {
    const list =
      fileOrList && typeof fileOrList.length === "number"
        ? Array.from(fileOrList)
        : fileOrList
        ? [fileOrList]
        : [];

    const videos = list.filter((f) => looksLikeVideo(f));
    if (videos.length === 0) {
      showToast("Sélectionne au moins une vidéo.", "error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedFiles.forEach((f) => {
      if (f._previewUrl) URL.revokeObjectURL(f._previewUrl);
    });

    const withPreview = videos.map((f) => {
      f._previewUrl = URL.createObjectURL(f);
      return f;
    });

    setGenerated(false);
    setBakedAudio(false);
    setSelectedFiles(withPreview);
    setPreviewUrl(withPreview[0]._previewUrl);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      showToast("Sélectionne au moins une vidéo.", "error");
      return;
    }
    if (!user) {
      showToast("Connecte-toi pour publier.", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setPublishStage("uploading");

    const total = selectedFiles.length;
    let done = 0;
    let successCount = 0;
    let metadataWarnings = 0;
    let failure = null;

    for (const file of selectedFiles) {
      const base = Math.round((done / total) * 100);
      const slice = 100 / total;

      // Fichiers déjà sur R2 pour cette publication : à supprimer si la ligne
      // vidéo n'est jamais créée (suppression compensatoire).
      const orphans = [];
      let videoCreated = false;

      try {
        setPublishStage("uploading");

        const durationPromise =
          generated && selectedFiles.length === 1
            ? Promise.resolve(formatTime(generatedSeconds))
            : readDuration(file).catch(() => "00:00");

        // Filtre choisi sur une vidéo brute : on l'incruste avant l'envoi.
        let fileToSend = file;
        if (filter?.anyActive && !generated && !file._filterBaked) {
          setFilterRendering(true);
          try {
            fileToSend = await renderVideoWithFilter({
              file,
              spec: filter.spec,
              fx: filter.face?.active ? filter.face.resolved : null,
              onProgress: (p) =>
                setUploadProgress(base + Math.round(p * slice * 0.5)),
            });
          } catch (error) {
            console.error("BAARO filtre:", error);
            showToast(
              "Le filtre n'a pas pu être appliqué : vidéo publiée sans filtre.",
              "info",
            );
          } finally {
            setFilterRendering(false);
          }
        }

        const uploaded = await uploadLargeVideo(fileToSend, {
          user_id: user.id,
          onProgress: (pct) =>
            setUploadProgress(base + Math.round((pct / 100) * slice * 0.7)),
        });
        const uploadedPath = uploaded.path || uploaded.object_key;
        if (uploadedPath) orphans.push(uploadedPath);
        const publicUrl = uploaded.publicUrl || uploaded.url;

        const duration = await durationPromise;

        let soundUrl = null;
        if (selectedSound?.audio_url && !bakedAudio) {
          soundUrl = selectedSound.audio_url;
          if (selectedSound.file) {
            const uploadedAudio = await uploadExternalMedia(
              selectedSound.file,
              "videos",
            );
            const audioPath = uploadedAudio.path || uploadedAudio.object_key;
            if (audioPath) orphans.push(audioPath);
            soundUrl = uploadedAudio.publicUrl || uploadedAudio.url;
          }
        }

        // Étape 2 : création de la publication.
        setPublishStage("creating");
        const collabFields = buildCollabPayload(collab);

        const { data: created, error: dbError } = await insertVideo(
          {
            author_id: user.id,
            video_url: publicUrl,
            title:
              uploadTitle.trim() ||
              (total > 1
                ? `Vidéo BAARO (${done + 1}/${total})`
                : "Vidéo BAARO"),
            description: uploadDescription.trim() || null,
            duration,
            views: 0,
            likes: 0,
            sound_id: selectedSound?.id ? String(selectedSound.id) : null,
            ...collabFields,
          },
          selectedSound
            ? {
                sound_title: selectedSound.title || null,
                ...(soundUrl
                  ? { sound_url: soundUrl, mute_original: !!muteOriginal }
                  : {}),
              }
            : {},
        );

        if (dbError || !created?.id) {
          throw dbError || new Error("Publication non créée");
        }

        // À partir d'ici la publication existe : plus aucun nettoyage de fichier,
        // et un échec secondaire ne doit plus la faire passer pour échouée.
        videoCreated = true;
        successCount += 1;

        // Étape 3 : métadonnées complémentaires (non bloquantes).
        setPublishStage("metadata");
        const hashtagsOk = await registerVideoHashtags(
          created.id,
          uploadTitle,
          uploadDescription,
        ).catch(() => false);
        if (!hashtagsOk) {
          metadataWarnings += 1;
          console.warn("BAARO hashtags non enregistrés pour", created.id);
        }
      } catch (error) {
        console.error(error);
        failure = error;

        // Fichier envoyé mais publication jamais créée : on le supprime de R2.
        if (!videoCreated && orphans.length) {
          await Promise.all(orphans.map((path) => discardUploadedMedia(path)));
        }
      }

      if (failure) break;

      done += 1;
      setUploadProgress(Math.round((done / total) * 100));
    }

    try {
      if (successCount > 0) {
        // Réponse à un commentaire : métadonnée, non bloquante.
        if (!failure && collab?.replyToCommentId) {
          const { error: replyError } = await supabase
            .from("video_comments")
            .update({ has_video_reply: true })
            .eq("id", collab.replyToCommentId);
          if (replyError) {
            metadataWarnings += 1;
            console.warn("BAARO réponse vidéo non marquée:", replyError);
          }
        }

        onRewardPoints?.("publish_video", "Vidéos publiées");
        showPointsReward?.(
          25 * successCount,
          `${successCount} vidéo(s) publiée(s)`,
        );
      }

      if (!failure) {
        setPublishStage("done");
        showToast(
          successCount === 1
            ? "Vidéo publiée avec succès 🎉"
            : `${successCount} vidéos publiées avec succès 🎉`,
          "success",
        );
        if (metadataWarnings > 0) {
          showToast(
            "Publiée, mais certains détails (hashtags…) n'ont pas pu être enregistrés.",
            "info",
          );
        }
        setShowUpload(false);
        resetUpload();
        filter?.reset();
      } else if (successCount > 0) {
        // Échec partiel : ce qui est publié reste publié, on garde le reste à renvoyer.
        showToast(
          `${successCount} vidéo(s) publiée(s) sur ${total}. Échec : ${
            failure.message || "publication impossible"
          }`,
          "error",
        );
        setSelectedFiles((prev) => prev.slice(successCount));
      } else {
        showToast(
          `Erreur : ${failure.message || "publication impossible"}`,
          "error",
        );
      }

      if (successCount > 0) await loadVideos();
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setPublishStage(null);
    }
  };

  return {
    showUpload,
    setShowUpload,
    selectedFile,
    selectedFiles,
    previewUrl,
    uploadTitle,
    setUploadTitle,
    uploadDescription,
    setUploadDescription,
    createMode,
    setCreateMode,
    photoFiles,
    photoSeconds,
    setPhotoSeconds,
    textContent,
    setTextContent,
    textTheme,
    setTextTheme,
    generating,
    generateProgress,
    generated,
    bakedAudio,
    uploading,
    uploadProgress,
    filterRendering,
    publishStage,
    fileInputRef,
    photoInputRef,
    previewVideoRef,
    previewAudioRef,
    handlePhotosSelected,
    removePhoto,
    handleGenerate,
    backToCreator,
    resetUpload,
    handleFileSelected,
    handleUpload,
    collab,
  };
}
