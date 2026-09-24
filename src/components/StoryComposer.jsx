import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Plus,
  Image as ImageIcon,
  Video,
  Music,
  Trash2,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { MediaCarousel } from "./MediaCarousel.jsx";
import { AudioPicker } from "./AudioPicker.jsx";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}


const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_MEDIA_ITEMS = 10;
const MAX_TEXT_LENGTH = 240;

/**
 * Valide un fichier média (image ou vidéo)
 */
const validateMediaFile = (file, type) => {
  if (!file) throw new Error("Fichier manquant.");

  // 1. Vérifier type MIME
  const allowedTypes = type === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Format non supporté. ${type === "image" ? "JPG, PNG, WebP, GIF" : "MP4, WebM"} acceptés.`);
  }

  // 2. Vérifier taille
  const maxSize = type === "image" ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (file.size > maxSize) {
    throw new Error(`${type} trop ${file.size > maxSize ? "gros" : "petit"} (max ${Math.round(maxSize / 1024 / 1024)}MB).`);
  }

  // 3. Vérifier taille minimale
  if (file.size < 1024) {
    throw new Error("Fichier corrompu? Taille trop petite.");
  }

  return true;
};

/**
 * Hook pour gérer la liste des médias
 */
function useMediaList() {
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const addMedia = useCallback(
    (file, type) => {
      if (mediaItems.length >= MAX_MEDIA_ITEMS) {
        throw new Error(`Maximum ${MAX_MEDIA_ITEMS} médias par story.`);
      }

      validateMediaFile(file, type);

      const previewUrl = URL.createObjectURL(file);
      const newMedia = {
        id: Date.now().toString(),
        type,
        file,
        previewUrl,
        textOverlay: "",
        transitionType: "fade",
        duration: type === "video" ? 15 : 5,
      };

      setMediaItems((prev) => [...prev, newMedia]);
      setSelectedIndex(mediaItems.length);
    },
    [mediaItems.length]
  );

  const removeMedia = useCallback((id) => {
    setMediaItems((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      if (updated.length === 0) {
        setSelectedIndex(null);
      } else if (selectedIndex >= updated.length) {
        setSelectedIndex(updated.length - 1);
      }
      return updated;
    });
  }, [selectedIndex]);

  const updateMedia = useCallback((id, updates) => {
    setMediaItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const moveMedia = useCallback((fromIndex, toIndex) => {
    setMediaItems((prev) => {
      const updated = [...prev];
      const [item] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, item);
      return updated;
    });
    setSelectedIndex(toIndex);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      mediaItems.forEach((m) => {
        if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
      });
    };
  }, []);

  return {
    mediaItems,
    selectedIndex,
    setSelectedIndex,
    addMedia,
    removeMedia,
    updateMedia,
    moveMedia,
  };
}

/**
 * Composant principal StoryComposer
 */
export function StoryComposer({ onCreated, onClose, currentUserId }) {
  const { mediaItems, selectedIndex, setSelectedIndex, addMedia, removeMedia, updateMedia, moveMedia } = useMediaList();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const selectedMedia = useMemo(
    () => (selectedIndex !== null ? mediaItems[selectedIndex] : null),
    [mediaItems, selectedIndex]
  );

  const isCarousel = mediaItems.length > 1;

  const handleImageUpload = (e) => {
    try {
      setErrorMessage(null);
      const file = e.target.files?.[0];
      if (file) {
        addMedia(file, "image");
      }
    } catch (err) {
      setErrorMessage(err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleVideoUpload = (e) => {
    try {
      setErrorMessage(null);
      const file = e.target.files?.[0];
      if (file) {
        addMedia(file, "video");
      }
    } catch (err) {
      setErrorMessage(err.message);
    }
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handlePublish = async () => {
    try {
      setErrorMessage(null);
      setIsPublishing(true);
      setUploadProgress(10);

      // Résoudre l'identité : prop puis session Supabase (auth.users.id)
      let authorId = currentUserId;
      if (!isValidAuthUserId(authorId)) {
        const { data: { user } } = await supabase.auth.getUser();
        authorId = user?.id || null;
      }
      if (!isValidAuthUserId(authorId)) {
        throw new Error("Identité invalide : auth.users.id requis. Connecte-toi pour publier une story.");
      }

      if (mediaItems.length === 0) {
        throw new Error("Ajoute au moins une image ou vidéo.");
      }

      // 1. Créer la story principale
      setUploadProgress(20);
      const { data: storyData, error: storyError } = await supabase
        .from("stories")
        .insert({
          author_id: authorId,
          story_type: isCarousel ? "carousel" : mediaItems[0].type,
          text: "", // Peut être vide pour média-only stories
          is_carousel: isCarousel,
          media_count: mediaItems.length,
        })
        .select()
        .single();

      if (storyError) {
        throw new Error(`Erreur création story: ${storyError.message}`);
      }

      setUploadProgress(30);

      // 2. Upload et insérer chaque média
      for (let i = 0; i < mediaItems.length; i++) {
        const media = mediaItems[i];
        const progress = 30 + (i / mediaItems.length) * 40; // 30-70%

        // Upload fichier
        // Chemin stable identité : auth.users.id / uuid.ext (aligné FeedStories)
        const ext = (media.file.name.split(".").pop() || (media.type === "video" ? "mp4" : "jpg")).toLowerCase();
        const path = `${authorId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("stories")
          .upload(path, media.file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: media.file.type,
          });

        if (uploadError) {
          throw new Error(`Erreur upload ${media.type}: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("stories")
          .getPublicUrl(path);

        // Insérer en DB
        const { error: mediaError } = await supabase.from("story_media").insert({
          story_id: storyData.id,
          position: i,
          media_type: media.type,
          media_url: urlData.publicUrl,
          duration_seconds: media.duration,
          text_overlay: media.textOverlay || null,
          transition_type: media.transitionType,
        });

        if (mediaError) {
          throw new Error(`Erreur insertion média: ${mediaError.message}`);
        }

        setUploadProgress(progress);
      }

      setUploadProgress(70);

      // 3. Ajouter audio si sélectionné
      if (selectedAudio) {
        const { error: audioError } = await supabase
          .from("story_audio_tracks")
          .insert({
            story_id: storyData.id,
            track_type: "background_music",
            audio_url: selectedAudio.audio_url,
            audio_title: selectedAudio.title,
            artist_name: selectedAudio.artist,
            duration_seconds: selectedAudio.duration_seconds,
            is_original: false,
            volume_level: 0.8,
          });

        if (audioError) {
          console.warn("Avertissement: Erreur ajout audio (non-critique):", audioError);
        }
      }

      setUploadProgress(90);

      // 4. Recalculate story duration (trigger automatically)
      setUploadProgress(100);

      // Callback
      onCreated?.();

      // Reset
      setTimeout(() => {
        onClose?.();
      }, 500);
    } catch (err) {
      console.error("❌ Erreur publication:", err);
      setErrorMessage(err?.message || "Erreur inconnue lors de la publication.");
      setIsPublishing(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b flex items-center justify-between p-4">
          <h2 id="composer-title" className="text-lg font-bold text-gray-900">
            Créer une story {isCarousel && `(${mediaItems.length} médias)`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Media preview and carousel */}
          {mediaItems.length > 0 ? (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Prévisualisation</h3>
                <div className="bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center relative">
                  {selectedMedia?.type === "image" ? (
                    <img
                      src={selectedMedia.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <video
                      src={selectedMedia?.previewUrl}
                      className="w-full h-full object-contain"
                      controls
                    />
                  )}

                  {/* Carousel navigation */}
                  {isCarousel && (
                    <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
                      <button
                        onClick={() =>
                          setSelectedIndex((i) =>
                            i === 0 ? mediaItems.length - 1 : i - 1
                          )
                        }
                        className="pointer-events-auto p-2 bg-black/50 hover:bg-black/70 rounded-full text-white m-2 transition-colors"
                        aria-label="Média précédent"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <span className="text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                        {selectedIndex + 1} / {mediaItems.length}
                      </span>
                      <button
                        onClick={() =>
                          setSelectedIndex((i) =>
                            i === mediaItems.length - 1 ? 0 : i + 1
                          )
                        }
                        className="pointer-events-auto p-2 bg-black/50 hover:bg-black/70 rounded-full text-white m-2 transition-colors"
                        aria-label="Média suivant"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Media editor */}
              {selectedMedia && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Texte overlay
                    </label>
                    <textarea
                      value={selectedMedia.textOverlay}
                      onChange={(e) =>
                        updateMedia(selectedMedia.id, {
                          textOverlay: e.target.value.slice(0, MAX_TEXT_LENGTH),
                        })
                      }
                      maxLength={MAX_TEXT_LENGTH}
                      className="w-full p-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Ajoute du texte sur ce média..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedMedia.textOverlay.length} / {MAX_TEXT_LENGTH}
                    </p>
                  </div>

                  {selectedMedia.type === "video" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Durée (secondes)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={selectedMedia.duration}
                        onChange={(e) =>
                          updateMedia(selectedMedia.id, {
                            duration: Math.max(1, Math.min(60, Number(e.target.value))),
                          })
                        }
                        className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {isCarousel && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Transition
                      </label>
                      <select
                        value={selectedMedia.transitionType}
                        onChange={(e) =>
                          updateMedia(selectedMedia.id, {
                            transitionType: e.target.value,
                          })
                        }
                        className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="fade">Fondu</option>
                        <option value="slide">Glisser</option>
                        <option value="zoom">Zoom</option>
                        <option value="none">Aucune</option>
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => removeMedia(selectedMedia.id)}
                    className="w-full px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    Supprimer ce média
                  </button>
                </div>
              )}

              {/* Media carousel (thumbnails) */}
              <MediaCarousel
                mediaItems={mediaItems}
                selectedIndex={selectedIndex}
                onSelectIndex={setSelectedIndex}
                onMove={moveMedia}
                onRemove={removeMedia}
              />
            </div>
          ) : (
            <div className="text-center py-8">
              <ImageIcon size={48} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">Ajoute une photo ou vidéo pour commencer</p>
            </div>
          )}

          {/* Add media buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-4 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
              aria-label="Ajouter une photo"
            >
              <ImageIcon size={20} />
              Photo
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex-1 px-4 py-3 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
              aria-label="Ajouter une vidéo"
            >
              <Video size={20} />
              Vidéo
            </button>
            <button
              onClick={() => {
                /* AudioPicker ouvre modal */
              }}
              className="flex-1 px-4 py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
              aria-label="Ajouter audio"
            >
              <Music size={20} />
              Audio
            </button>
          </div>

          {/* Audio picker */}
          <AudioPicker
            selectedAudio={selectedAudio}
            onSelectAudio={setSelectedAudio}
            onRemoveAudio={() => setSelectedAudio(null)}
          />

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
            aria-hidden="true"
          />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t p-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            disabled={isPublishing}
          >
            Annuler
          </button>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {uploadProgress}%
              </span>
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={isPublishing || mediaItems.length === 0}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            aria-label="Publier la story"
          >
            {isPublishing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Publication...
              </>
            ) : uploadProgress === 100 ? (
              <>
                <CheckCircle size={18} />
                Succès!
              </>
            ) : (
              <>
                <Plus size={18} />
                Publier
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
