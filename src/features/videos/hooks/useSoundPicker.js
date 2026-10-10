import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ToastContext.jsx";

// Choix du son d'une publication : écoute, import d'un audio, son d'origine coupé.
export function useSoundPicker(sounds) {
  const { showToast } = useToast();

  const [selectedSound, setSelectedSound] = useState(null);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [previewingSoundId, setPreviewingSoundId] = useState(null);

  const soundPreviewRef = useRef(null);
  const soundFileInputRef = useRef(null);

  const stopSoundPreview = useCallback(() => {
    if (soundPreviewRef.current) {
      soundPreviewRef.current.pause();
      soundPreviewRef.current = null;
    }
    setPreviewingSoundId(null);
  }, []);

  useEffect(() => () => stopSoundPreview(), [stopSoundPreview]);

  const toggleSoundPreview = (sound) => {
    const key = String(sound.id ?? sound.audio_url);
    if (previewingSoundId === key) {
      stopSoundPreview();
      return;
    }
    stopSoundPreview();
    if (!sound.audio_url) {
      showToast("Ce son n'a pas de fichier audio.", "error");
      return;
    }
    const audio = new Audio(sound.audio_url);
    audio.onended = () => stopSoundPreview();
    audio.onerror = () => {
      showToast("Impossible de lire ce son.", "error");
      stopSoundPreview();
    };
    soundPreviewRef.current = audio;
    setPreviewingSoundId(key);
    audio.play().catch(() => stopSoundPreview());
  };

  const chooseSound = (sound) => {
    stopSoundPreview();
    setSelectedSound(sound);
    if (!sound) setMuteOriginal(false);
    setShowSoundPicker(false);
  };

  const handleSoundFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      showToast("Sélectionne un fichier audio.", "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast("Audio trop lourd (20 Mo max).", "error");
      return;
    }
    chooseSound({
      id: null,
      title: file.name.replace(/\.[^.]+$/, "") || "Mon audio",
      artist: "Audio importé",
      audio_url: URL.createObjectURL(file),
      file,
    });
  };

  const resetSound = () => {
    stopSoundPreview();
    setMuteOriginal(false);
    setSelectedSound(null);
    setShowSoundPicker(false);
  };

  return {
    sounds,
    selectedSound,
    showSoundPicker,
    setShowSoundPicker,
    muteOriginal,
    setMuteOriginal,
    previewingSoundId,
    soundFileInputRef,
    stopSoundPreview,
    toggleSoundPreview,
    chooseSound,
    handleSoundFile,
    resetSound,
  };
}
