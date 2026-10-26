import { useState } from "react";
import { ListVideo, Plus, X } from "lucide-react";
import { COLORS } from "../../../theme.js";

/**
 * Gérer / ajouter à une série (playlist).
 */
export default function PlaylistSheet({
  playlists = [],
  videoId,
  onCreate,
  onAdd,
  onClose,
  onOpenPlaylist,
}) {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    const row = await onCreate?.({ title: title.trim(), isSeries: true });
    setCreating(false);
    if (row && videoId) {
      await onAdd?.(row.id, videoId);
      setTitle("");
    }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-xl max-h-[70dvh] bg-zinc-950 rounded-t-3xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div>
            <h3 className="font-black flex items-center gap-2">
              <ListVideo size={16} />
              Séries
            </h3>
            <p className="text-[10px] text-white/40">
              Regroupe tes vidéos · lecture enchaînée
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 border-b border-white/10 flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nouvelle série…"
            className="flex-1 rounded-2xl bg-white/10 px-4 py-2.5 text-sm outline-none"
          />
          <button
            type="button"
            disabled={creating || !title.trim()}
            onClick={handleCreate}
            className="h-11 px-4 rounded-2xl font-black text-sm disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Plus size={16} className="inline" /> Créer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {playlists.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-10">
              Aucune série. Crée-en une ci-dessus.
            </p>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] px-3 py-2.5"
              >
                <button
                  type="button"
                  className="flex-1 text-left min-w-0"
                  onClick={() => onOpenPlaylist?.(pl.id)}
                >
                  <div className="text-sm font-black truncate">{pl.title}</div>
                  <div className="text-[10px] text-white/40">
                    {pl.is_series ? "Série" : "Playlist"}
                  </div>
                </button>
                {videoId && (
                  <button
                    type="button"
                    onClick={() => onAdd?.(pl.id, videoId)}
                    className="text-[11px] font-black px-3 py-1.5 rounded-xl bg-white/10"
                  >
                    Ajouter
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
