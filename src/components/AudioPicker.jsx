import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Music,
  X,
  Search,
  Play,
  Pause,
  AlertCircle,
  Upload,
  Heart,
  Clock,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { COLORS } from "../theme.js";

const MAX_VOICEOVER_SIZE = 10 * 1024 * 1024; // 10 MB
const GENRES = ["tous", "lo-fi", "pop", "electronic", "chill", "acoustic"];
const PAGE_SIZE = 30;
const TABS = [
  { id: "library", label: "Library", icon: Music },
  { id: "recent", label: "Récents", icon: Clock },
  { id: "favorites", label: "Favoris", icon: Heart },
];

const FAVORITES_KEY = "baaro-audio-favorites";
const RECENTS_KEY = "baaro-audio-recents";

function loadLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function saveLocal(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    // stockage indisponible
  }
}

/** Filtre client par titre ou artiste */
function filterByQuery(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((track) => {
    const title = (track.title || "").toLowerCase();
    const artist = (track.artist || "").toLowerCase();
    return title.includes(q) || artist.includes(q);
  });
}

/**
 * AudioPicker – Library + Récents + Favoris + Upload + Pagination + Recherche
 *
 * La fonction SQL search_audio_library(p_query, p_genre, p_limit) n'a pas de
 * paramètre p_offset : la pagination se fait en demandant une limite plus grande.
 */
export function AudioPicker({ selectedAudio, onSelectAudio, onRemoveAudio }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [tab, setTab] = useState("library");
  const [audioLibrary, setAudioLibrary] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState("tous");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectingId, setSelectingId] = useState(null);
  const [error, setError] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [favorites, setFavorites] = useState(() => loadLocal(FAVORITES_KEY));
  const [recents, setRecents] = useState(() => loadLocal(RECENTS_KEY));

  const previewAudioRef = useRef(null);
  const fileInputRef = useRef(null);
  const loadedCountRef = useRef(0);

  // --- Load library (pagination par limite croissante) ---
  const loadLibrary = useCallback(
    async ({ reset = false } = {}) => {
      if (tab !== "library") return;

      if (reset) {
        loadedCountRef.current = 0;
        setIsLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const limit = reset ? PAGE_SIZE : loadedCountRef.current + PAGE_SIZE;

      try {
        const { data, error: queryError } = await supabase.rpc("search_audio_library", {
          p_query: searchQuery.trim() || null,
          p_genre: selectedGenre === "tous" ? null : selectedGenre,
          p_limit: limit,
        });

        if (queryError) throw new Error(queryError.message);

        const rows = data || [];
        setAudioLibrary(rows);
        loadedCountRef.current = rows.length;
        setHasMore(rows.length >= limit);
      } catch (err) {
        console.error("[AudioPicker]", err);
        setError(err?.message || "Impossible de charger la library");
        if (reset) setAudioLibrary([]);
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, searchQuery, selectedGenre]
  );

  useEffect(() => {
    if (!showLibrary || tab !== "library") return;
    const t = setTimeout(() => loadLibrary({ reset: true }), 280);
    return () => clearTimeout(t);
  }, [showLibrary, tab, searchQuery, selectedGenre, loadLibrary]);

  // --- Preview ---
  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  // Escape pour fermer
  useEffect(() => {
    if (!showLibrary) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        stopPreview();
        setShowLibrary(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLibrary, stopPreview]);

  // --- Favoris ---
  const toggleFavorite = (track) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.id === track.id);
      const next = exists
        ? prev.filter((t) => t.id !== track.id)
        : [
            {
              id: track.id,
              title: track.title,
              artist: track.artist,
              audio_url: track.audio_url,
              preview_url: track.preview_url,
              duration_seconds: track.duration_seconds,
              license_name: track.license_name,
              attribution_required: track.attribution_required,
            },
            ...prev,
          ];
      saveLocal(FAVORITES_KEY, next);
      return next;
    });
  };

  const isFavorite = (id) => favorites.some((t) => t.id === id);

  // --- Sélection ---
  const handleSelectTrack = async (track) => {
    setSelectingId(track.id);
    try {
      try {
        await supabase.rpc("record_sound_usage", { p_sound_id: String(track.id) });
      } catch {
        // statistiques : jamais bloquant
      }

      // Ajoute aux récents
      setRecents((prev) => {
        const next = [
          {
            id: track.id,
            title: track.title,
            artist: track.artist,
            audio_url: track.audio_url,
            preview_url: track.preview_url,
            duration_seconds: track.duration_seconds,
            license_name: track.license_name,
            attribution_required: track.attribution_required,
          },
          ...prev.filter((t) => t.id !== track.id),
        ].slice(0, 30);
        saveLocal(RECENTS_KEY, next);
        return next;
      });

      onSelectAudio({
        ...track,
        source: track.source || "library",
      });
      stopPreview();
      setShowLibrary(false);
    } finally {
      setSelectingId(null);
    }
  };

  const handlePlayPreview = (track) => {
    if (previewingId === track.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(track.preview_url || track.audio_url);
    audio.onended = () => {
      setPreviewingId(null);
      previewAudioRef.current = null;
    };
    audio.play().catch(console.error);
    previewAudioRef.current = audio;
    setPreviewingId(track.id);
  };

  // --- Upload voiceover ---
  const handleUploadVoiceover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      setError("Fichier audio uniquement");
      return;
    }
    if (file.size > MAX_VOICEOVER_SIZE) {
      setError("Fichier trop lourd (max 10 Mo)");
      return;
    }

    onSelectAudio({
      id: `local_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: "Voiceover",
      file,
      source: "upload",
    });
    setShowLibrary(false);
  };

  // Liste selon l’onglet + recherche titre/artiste
  const currentList = (() => {
    if (tab === "favorites") return filterByQuery(favorites, searchQuery);
    if (tab === "recent") return filterByQuery(recents, searchQuery);
    return filterByQuery(audioLibrary, searchQuery);
  })();

  return (
    <div className="space-y-3">
      {/* Audio sélectionné */}
      {selectedAudio ? (
        <div
          className="p-3 rounded-xl border flex items-center justify-between gap-3"
          style={{ background: COLORS.surface2, borderColor: COLORS.border }}
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" style={{ color: COLORS.ivory }}>
              {selectedAudio.title}
            </p>
            <p className="text-xs truncate" style={{ color: COLORS.muted }}>
              {selectedAudio.artist || "Audio"}
              {selectedAudio.duration_seconds ? ` • ${selectedAudio.duration_seconds}s` : ""}
            </p>
            {selectedAudio.license_name && (
              <p className="text-[11px] mt-0.5" style={{ color: COLORS.teal }}>
                {selectedAudio.license_name}
                {selectedAudio.attribution_required ? " • attribution requise" : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRemoveAudio}
            className="p-2 rounded-lg hover:bg-white/10 shrink-0"
            aria-label="Retirer l'audio"
          >
            <X size={18} style={{ color: COLORS.muted }} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowLibrary(true)}
          className="w-full px-4 py-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"
          style={{ borderColor: COLORS.border, color: COLORS.muted }}
        >
          <Music size={18} />
          <span>Ajouter de la musique</span>
        </button>
      )}

      {/* Modal (portail dans document.body : reste fixe à l'écran) */}
      {showLibrary &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => {
              stopPreview();
              setShowLibrary(false);
            }}
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="audio-library-title"
            >
              {/* Header */}
              <div
                className="flex items-center justify-between p-4 border-b shrink-0"
                style={{ borderColor: COLORS.border }}
              >
                <h3
                  id="audio-library-title"
                  className="font-bold text-sm"
                  style={{ color: COLORS.ivory }}
                >
                  BAARO Sounds
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    stopPreview();
                    setShowLibrary(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10"
                  aria-label="Fermer"
                >
                  <X size={20} style={{ color: COLORS.muted }} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b shrink-0" style={{ borderColor: COLORS.border }}>
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors"
                    style={{
                      color: tab === id ? COLORS.gold : COLORS.muted,
                      borderBottom:
                        tab === id ? `2px solid ${COLORS.gold}` : "2px solid transparent",
                    }}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Recherche (tous les onglets) + genres/upload (library) */}
              <div
                className="p-4 space-y-3 border-b shrink-0"
                style={{ borderColor: COLORS.border }}
              >
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: COLORS.muted }}
                  />
                  <input
                    type="text"
                    placeholder="Rechercher par titre ou artiste..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                    style={{
                      background: COLORS.surface2,
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.ivory,
                    }}
                    aria-label="Rechercher par titre ou artiste"
                  />
                </div>

                {tab === "library" && (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {GENRES.map((genre) => (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => setSelectedGenre(genre)}
                          className="px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors"
                          style={{
                            background:
                              selectedGenre === genre ? COLORS.gold : COLORS.surface2,
                            color: selectedGenre === genre ? "#000" : COLORS.muted,
                          }}
                        >
                          {genre === "tous" ? "Tous" : genre}
                        </button>
                      ))}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleUploadVoiceover}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium border transition-colors"
                      style={{ borderColor: COLORS.border, color: COLORS.teal }}
                    >
                      <Upload size={14} />
                      Uploader un voiceover
                    </button>
                  </>
                )}
              </div>

              {/* Erreur */}
              {error && (
                <div
                  className="mx-4 mt-3 p-3 rounded-xl flex gap-2 text-sm"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Liste */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <div
                      className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: COLORS.gold, borderTopColor: "transparent" }}
                    />
                  </div>
                ) : currentList.length === 0 ? (
                  <div className="text-center py-12" style={{ color: COLORS.muted }}>
                    <Music size={40} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">
                      {tab === "favorites"
                        ? "Aucun favori pour l’instant"
                        : tab === "recent"
                        ? "Aucun son récent"
                        : "Aucun son trouvé"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {currentList.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handlePlayPreview(track)}
                          className="p-2 rounded-full shrink-0"
                          style={{
                            background: "rgba(20,184,166,0.15)",
                            color: COLORS.teal,
                          }}
                          aria-label={
                            previewingId === track.id ? "Arrêter" : "Écouter aperçu"
                          }
                        >
                          {previewingId === track.id ? (
                            <Pause size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: COLORS.ivory }}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs truncate" style={{ color: COLORS.muted }}>
                            {track.artist || "Sans artiste"}
                            {track.duration_seconds
                              ? ` • ${track.duration_seconds}s`
                              : ""}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleFavorite(track)}
                          className="p-1.5 rounded-lg shrink-0"
                          style={{
                            color: isFavorite(track.id) ? "#f43f5e" : COLORS.muted,
                          }}
                          aria-label={
                            isFavorite(track.id)
                              ? "Retirer des favoris"
                              : "Ajouter aux favoris"
                          }
                        >
                          <Heart
                            size={14}
                            fill={isFavorite(track.id) ? "currentColor" : "none"}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectTrack(track)}
                          disabled={selectingId === track.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-50"
                          style={{ background: COLORS.gold, color: "#000" }}
                        >
                          {selectingId === track.id ? "..." : "Utiliser"}
                        </button>
                      </div>
                    ))}

                    {/* Pagination */}
                    {tab === "library" && hasMore && (
                      <div className="pt-3 text-center">
                        <button
                          type="button"
                          onClick={() => loadLibrary({ reset: false })}
                          disabled={loadingMore}
                          className="px-4 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 mx-auto transition-colors"
                          style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                        >
                          {loadingMore ? (
                            "Chargement..."
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              Afficher plus
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      <p className="text-[11px]" style={{ color: COLORS.muted }}>
        La musique sera jouée en arrière-plan pendant la lecture du média
      </p>
    </div>
  );
}

export default AudioPicker;
