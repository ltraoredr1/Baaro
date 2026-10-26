import { useEffect, useState } from "react";
import { ArrowLeft, Hash, Trophy } from "lucide-react";
import { COLORS } from "../../../theme.js";
import {
  getHashtagLeaderboard,
  listActiveChallenges,
} from "../../../lib/videoEngagement.js";

/**
 * Page hashtag / défi : classement + grille.
 * À brancher dans le routeur (ex. ?hashtag=baaro ou /hashtag/:tag).
 */
export default function HashtagPage({ tag, onBack, onOpenVideo }) {
  const clean = String(tag || "").replace(/^#/, "").trim();
  const [rows, setRows] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [board, chal] = await Promise.all([
          getHashtagLeaderboard(clean, 40),
          listActiveChallenges().catch(() => []),
        ]);
        if (cancelled) return;
        setRows(board);
        setChallenges(
          (chal || []).filter(
            (c) => c.hashtag?.toLowerCase() === clean.toLowerCase(),
          ),
        );
      } catch (e) {
        if (!cancelled) setError(e.message || "Chargement impossible");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clean]);

  const challenge = challenges[0];

  return (
    <div className="min-h-full bg-black text-white pb-24">
      <div className="sticky top-0 z-20 bg-black/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-black text-lg">
            <Hash size={18} style={{ color: COLORS.gold }} />
            {clean}
          </div>
          <p className="text-[11px] text-white/40">
            {rows.length} vidéo(s) · classement engagement
          </p>
        </div>
      </div>

      {challenge && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
          <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
            <Trophy size={16} />
            Défi BAARO
          </div>
          <h2 className="mt-1 font-black text-lg">{challenge.title}</h2>
          {challenge.description && (
            <p className="mt-1 text-xs text-white/60 leading-relaxed">
              {challenge.description}
            </p>
          )}
          {challenge.reward_points > 0 && (
            <p className="mt-2 text-[11px] font-bold text-amber-200/80">
              +{challenge.reward_points} pts pour le top du classement
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="text-center text-white/40 text-sm py-16">Chargement…</p>
      )}
      {error && (
        <p className="text-center text-red-300 text-sm py-16">{error}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-center text-white/40 text-sm py-16">
          Aucune vidéo pour #{clean} pour l&apos;instant.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 p-3">
        {rows.map((row, i) => (
          <button
            key={row.video_id}
            type="button"
            onClick={() => onOpenVideo?.(row)}
            className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 text-left"
          >
            {row.thumbnail_url || row.video_url ? (
              <img
                src={row.thumbnail_url || row.video_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20" />
            <div className="absolute top-2 left-2 h-6 min-w-6 px-1.5 rounded-full bg-black/60 text-[10px] font-black flex items-center justify-center">
              #{i + 1}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div className="text-[11px] font-bold truncate">
                @{row.handle?.replace(/^@/, "") || "membre"}
              </div>
              <div className="text-[10px] text-white/50">
                {Number(row.views || 0).toLocaleString("fr-FR")} vues · score{" "}
                {Math.round(row.score || 0)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
