import { useCallback, useEffect, useState } from "react";
import { Music, X, Search, Volume2, Play, Pause, AlertCircle } from "lucide-react";
import { supabase } from "../supabaseClient.js";

const MAX_VOICEOVER_SIZE = 10 * 1024 * 1024; // 10MB
const GENRES = ["tous", "lo-fi", "pop", "electronic", "chill", "acoustic"];

/**
 * AudioPicker - Sélectionner audio library ou uploader voiceover
 */
export function AudioPicker({ selectedAudio, onSelectAudio, onRemoveAudio }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [audioLibrary, setAudioLibrary] = useState([]);
  const [filteredLibrary, setFilteredLibrary] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState("tous");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [previewAudio, setPreviewAudio] = useState(null);

  // Load audio library
  useEffect(() => {
    const loadLibrary = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.rpc("search_audio_library", {
          p_query: searchQuery || null,
          p_genre: selectedGenre === "tous" ? null : selectedGenre,
          p_limit: 50,
        });

        if (queryError) {
          throw new Error(`Erreur: ${queryError.message}`);
        }

        setAudioLibrary(data || []);
      } catch (err) {
        console.error("❌ Erreur chargement library audio:", err);
        setError(err?.message || "Impossible de charger la library audio");
        setAudioLibrary([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      loadLibrary();
    }, 300); // Debounce search

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedGenre]);

  // Filter library
  useEffect(() => {
    let filtered = audioLibrary;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (track) =>
          track.title.toLowerCase().includes(query) ||
          track.artist?.toLowerCase().includes(query)
      );
    }

    setFilteredLibrary(filtered);
  }, [audioLibrary, searchQuery]);

  const handleSelectTrack = (track) => {
    onSelectAudio({
      id: track.id,
      title: track.title,
      artist: track.artist,
      audio_url: track.audio_url,
      duration_seconds: track.duration_seconds,
      preview_url: track.preview_url,
    });
    setShowLibrary(false);
  };

  const handlePlayPreview = (track) => {
    if (previewingId === track.id) {
      // Stop preview
      if (previewAudio) {
        previewAudio.pause();
        setPreviewAudio(null);
      }
      setPreviewingId(null);
    } else {
      // Play preview
      if (previewAudio) {
        previewAudio.pause();
      }

      const audio = new Audio(track.preview_url);
      audio.onended = () => {
        setPreviewingId(null);
        setPreviewAudio(null);
      };
      audio.play().catch((err) => {
        console.error("❌ Erreur playback preview:", err);
      });

      setPreviewAudio(audio);
      setPreviewingId(track.id);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    };
  }, [previewAudio]);

  return (
    <div className="space-y-3">
      {/* Selected audio display */}
      {selectedAudio ? (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
          <div className="flex-1">
            <p className="font-medium text-gray-900">{selectedAudio.title}</p>
            <p className="text-sm text-gray-600">{selectedAudio.artist || "Audio sans titre"}</p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedAudio.duration_seconds}s
            </p>
          </div>
          <button
            onClick={onRemoveAudio}
            className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
            aria-label="Retirer l'audio"
          >
            <X size={18} className="text-orange-600" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowLibrary(true)}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 hover:border-orange-400 rounded-lg flex items-center justify-center gap-2 text-gray-600 hover:text-orange-600 transition-colors"
          aria-label="Ajouter de la musique"
        >
          <Music size={20} />
          <span>Ajouter de la musique</span>
        </button>
      )}

      {/* Library modal */}
      {showLibrary && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-library-title"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h3 id="audio-library-title" className="text-lg font-bold text-gray-900">
                Musique gratuite
              </h3>
              <button
                onClick={() => setShowLibrary(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Fermer"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {/* Search */}
            <div className="sticky top-16 bg-white border-b p-4 space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Chercher par titre ou artiste..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  aria-label="Rechercher de la musique"
                />
              </div>

              {/* Genre filter */}
              <div className="flex gap-2 overflow-x-auto">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre)}
                    className={`px-3 py-1 rounded-full whitespace-nowrap text-sm transition-colors ${
                      selectedGenre === genre
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    aria-pressed={selectedGenre === genre}
                  >
                    {genre === "tous" ? "Tous" : genre}
                  </button>
                ))}
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
                <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Content */}
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                </div>
              ) : filteredLibrary.length === 0 ? (
                <div className="text-center py-12">
                  <Music size={48} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500">Pas de musique trouvée</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLibrary.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors group"
                    >
                      {/* Preview button */}
                      <button
                        onClick={() => handlePlayPreview(track)}
                        className="p-2 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-full transition-colors flex-shrink-0"
                        aria-label={previewingId === track.id ? "Arrêter" : "Écouter aperçu"}
                      >
                        {previewingId === track.id ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                      </button>

                      {/* Track info */}
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{track.title}</p>
                        <p className="text-sm text-gray-600">
                          {track.artist || "Sans artiste"} • {track.duration_seconds}s
                        </p>
                      </div>

                      {/* Select button */}
                      <button
                        onClick={() => handleSelectTrack(track)}
                        className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={`Sélectionner ${track.title}`}
                      >
                        Utiliser
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info text */}
      <p className="text-xs text-gray-500">
        La musique sera jouée en arrière-plan pendant la lecture de la story
      </p>
    </div>
  );
}
