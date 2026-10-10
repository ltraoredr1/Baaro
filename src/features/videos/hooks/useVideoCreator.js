import { uploadExternalMedia } from "../../../lib/externalMedia.js";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient.js";
import { useToast } from "../../../components/ToastContext.jsx";
import { MAX_PHOTOS } from "../constants.js";
import { formatTime } from "../utils/format.js";
import { insertVideo } from "../utils/videosApi.js";
import { 
  loadImage,
  makePhotoDrawer,
  makeTextDrawer,
  readDuration,
  renderToFile,
} from "../utils/videoRenderer.js";

// Fenêtre de publication : choix du média (vidéo / photos / texte), aperçu, envoi.
export function useVideoCreator({
  user,
  loadVideos,
  onRewardPoints,
  soundPicker,
}) {
  const { showToast, showPointsReward } = useToast();
  const { selectedSound, muteOriginal, stopSoundPreview, resetSound } =
    soundPicker;

  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
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

  const photoInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const previewAudioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      setGenerateProgress(0);

      let drawFrame;
      let totalMs;

      if (createMode === "photo") {
        if (!photoFiles.length) {
          showToast("Ajoute au moins une photo.", "error");
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
          return;
        }
        const words = text.split(/\s+/).length;
        totalMs = Math.min(15, Math.max(5, Math.ceil(words * 0.5))) * 1000;
        drawFrame = makeTextDrawer(text, textTheme);
      }

      const file = await renderToFile({
        drawFrame,
        totalMs,
        audioUrl: wantSound ? selectedSound.audio_url : null,
        audioCtx,
        onProgress: setGenerateProgress,
      });

      handleFileSelected(file);
      setGenerated(true);
      setBakedAudio(wantSound);
      setGeneratedSeconds(Math.round(totalMs / 1000));
    } catch (error) {
      console.error(error);
      showToast(`Création impossible : ${error.message || "erreur"}`, "error");
    } finally {
      audioCtx?.close?.().catch(() => {});
      setGenerating(false);
      setGenerateProgress(0);
    }
  };

  const backToCreator = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setUploadTitle("");
    setUploadDescription("");
    setUploadProgress(0);
  };

  const handleFileSelected = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      showToast("Sélectionne un fichier vidéo.", "error");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setGenerated(false);
    setBakedAudio(false);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("Sélectionne une vidéo.", "error");
      return;
    }

    if (!user) {
      showToast("Connecte-toi pour publier.", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(30);
      // Upload média de la vidéo via Cloudflare R2
      const uploaded = await uploadExternalMedia(selectedFile, "videos");
      const publicUrl = uploaded.publicUrl || uploaded.url;
      setUploadProgress(65);

      const duration = generated
        ? formatTime(generatedSeconds)
        : await readDuration(selectedFile);

      // Traitement du son séparé via Cloudflare R2 si présent
      let soundUrl = null;
      if (selectedSound?.audio_url && !bakedAudio) {
        soundUrl = selectedSound.audio_url;
        if (selectedSound.file) {
          const uploadedAudio = await uploadExternalMedia(
            selectedSound.file,
            "videos",
          );
          soundUrl = uploadedAudio.publicUrl || uploadedAudio.url;
        }
      }
      setUploadProgress(80);

      const {
        data: created,
        error: dbError,
        degraded,
      } = await insertVideo(
        {
          author_id: user.id,
          video_url: publicUrl,
          title: uploadTitle.trim() || "Vidéo BAARO",
          description: uploadDescription.trim() || null,
          duration,
          views: 0,
          likes: 0,
          sound_id: selectedSound?.id ? String(selectedSound.id) : null,
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

      if (dbError) throw dbError;

      setUploadProgress(100);
      onRewardPoints?.("publish_video", "Vidéo publiée", created?.id);
      showPointsReward?.(25, "Vidéo publiée");
      showToast("Vidéo publiée avec succès 🎉", "success");

      setShowUpload(false);
      resetUpload();
      await loadVideos();
    } catch (error) {
      console.error(error);
      showToast(
        `Erreur : ${error.message || "publication impossible"}`,
        "error",
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return {
    showUpload,
    setShowUpload,
    selectedFile,
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
  };
}
