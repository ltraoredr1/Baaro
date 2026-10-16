import { GoogleGenAI } from "@google/genai";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ToastContext.jsx";
import { uploadExternalMedia } from "../../../lib/externalMedia.js";
import { supabase } from "../../../supabaseClient.js";
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

// Helper de génération par IA Gemini (Text & Visuals)
async function generateGeminiVisual(promptText) {
  const apiKey =
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("VITE_GEMINI_API_KEY non configurée dans .env");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Tentative de génération d'image via Gemini / Imagen
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: `Création visuelle verticale 9:16 attrayante pour réseau social: ${promptText}`,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "9:16",
      },
    });

    const base64Image = response?.generatedImages?.[0]?.image?.imageBytes;
    if (!base64Image) return null;

    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/jpeg" });

    const file = new File([blob], `gemini-ai-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    return {
      file,
      url: URL.createObjectURL(file),
    };
  } catch (error) {
    console.warn("Génération visuelle Gemini indisponible/repli local:", error);
    return null;
  }
}

// Fenêtre de publication : choix du média (vidéo / photos / texte / Gemini IA), aperçu, envoi.
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

        // Tentative d'enrichissement visuel via Gemini IA
        const geminiResult = await generateGeminiVisual(text);
        setGenerateProgress(0.5);

        if (geminiResult) {
          const aiImage = await loadImage(geminiResult.url);
          totalMs = 6000; // 6 secondes pour le visuel IA
          drawFrame = makePhotoDrawer([aiImage], 6);
        } else {
          // Fallback Canvas local texte animé si Gemini n'est pas configuré
          const words = text.split(/\s+/).length;
          totalMs = Math.min(15, Math.max(5, Math.ceil(words * 0.5))) * 1000;
          drawFrame = makeTextDrawer(text, textTheme);
        }
      }

      const file = await renderToFile({
        drawFrame,
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
      const uploaded = await uploadExternalMedia(selectedFile, "videos");
      const publicUrl = uploaded.publicUrl || uploaded.url;
      setUploadProgress(65);

      const duration = generated
        ? formatTime(generatedSeconds)
        : await readDuration(selectedFile);

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
