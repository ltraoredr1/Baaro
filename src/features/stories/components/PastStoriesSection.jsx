import { useCallback, useEffect, useState } from 'react';
import { History, Eye, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { fetchMyPastStories, fetchStoryCountsBatch } from '../api/storiesApi.js';
import { formatAbsoluteShort, formatRelativePast } from '../lib/storyTime.js';

/**
 * Historique des stories passées (expirées) du propriétaire,
 * avec compteurs de vues / réactions.
 */
export function PastStoriesSection({ userId, onOpenStory, onOpenInsights }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const list = await fetchMyPastStories(userId, { days: 14, limit: 40 });
      setItems(list);
      if (list.length) {
        const batch = await fetchStoryCountsBatch(list.map((s) => s.id));
        setCounts(batch);
      } else {
        setCounts({});
      }
      setLoadedOnce(true);
    } catch (e) {
      console.error('[Stories] past:', e);
      setError(e?.message || 'Impossible de charger l’historique');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && !loadedOnce && userId) load();
  }, [open, loadedOnce, userId, load]);

  if (!userId) return null;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.border }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left"
        style={{ background: C.surface2, color: C.ivory }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <History size={16} style={{ color: C.gold }} />
          <span className="font-bold text-sm truncate">Historique (stories passées)</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="p-3 space-y-2" style={{ background: C.surface }}>
          {loading && (
            <p className="text-sm" style={{ color: C.muted }}>
              Chargement…
            </p>
          )}
          {!loading && error && (
            <p className="text-sm text-red-300">{error}</p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm" style={{ color: C.muted }}>
              Aucune story expirée sur les 14 derniers jours.
            </p>
          )}
          {!loading &&
            !error &&
            items.map((story) => {
              const c = counts[story.id];
              const thumb =
                story.media_type === 'image' && story.media_url
                  ? story.media_url
                  : null;
              return (
                <div
                  key={story.id}
                  className="flex items-center gap-3 rounded-xl border p-2"
                  style={{ borderColor: C.border, background: C.surface2 }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenStory?.(story)}
                    className="h-12 w-12 rounded-lg overflow-hidden border shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{ borderColor: C.borderGold, background: C.surface }}
                    aria-label="Voir la story"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : story.media_type === 'video' ? (
                      '🎬'
                    ) : (
                      'Aa'
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">
                      {story.caption?.trim() || (story.media_type === 'text' ? 'Story texte' : 'Story')}
                    </div>
                    <div className="text-[10px]" style={{ color: C.muted }}>
                      {formatAbsoluteShort(story.publish_at)} · {formatRelativePast(story.publish_at)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px]" style={{ color: C.muted }}>
                      <span className="inline-flex items-center gap-0.5">
                        <Eye size={11} /> {c ? c.views : '—'}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Heart size={11} /> {c ? c.likes : '—'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenInsights?.(story, c)}
                    className="text-[11px] font-semibold px-2 py-1.5 rounded-lg shrink-0"
                    style={{ background: 'rgba(217,174,82,0.15)', color: C.gold }}
                  >
                    Insights
                  </button>
                </div>
              );
            })}

          {loadedOnce && (
            <button
              type="button"
              onClick={load}
              className="text-[11px] font-medium w-full py-1.5"
              style={{ color: C.muted }}
              disabled={loading}
            >
              Actualiser
            </button>
          )}
        </div>
      )}
    </div>
  );
}
