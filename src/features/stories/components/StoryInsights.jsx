import { useEffect, useState } from 'react';
import { X, Eye, Heart, Clock, Calendar } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import TranslateButton from '../../../components/TranslateButton.jsx';
import { EngagementList } from '../../../components/EngagementList.jsx';
import {
  formatAbsoluteShort,
  formatRelativePast,
  formatTimeLeft,
  formatOwnerStoryMeta,
} from '../lib/storyTime.js';

/**
 * Panneau Insights complet pour le propriétaire d'une story.
 * - Heure de publication (absolue + relative)
 * - Temps restant / expirée
 * - Nombre de vues + accès liste
 * - Nombre de réactions + accès liste
 */
export function StoryInsights({
  story,
  counts,
  userId,
  onClose,
}) {
  const [listType, setListType] = useState(null); // 'storyViews' | 'storyLikes' | null
  const [translatedCaption, setTranslatedCaption] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Rafraîchir le temps restant chaque minute
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!story) return null;

  const isOwner = story.author_id === userId;
  if (!isOwner) return null;

  const views = counts?.views;
  const likes = counts?.likes;
  const publishedAt = story.publish_at || story.created_at;
  const expiresAt = story.expires_at;
  const expired = expiresAt ? new Date(expiresAt).getTime() <= now : false;
  const metaLine = formatOwnerStoryMeta(story, now);

  if (listType) {
    return (
      <EngagementList
        type={listType}
        targetId={story.id}
        ownerId={story.author_id}
        viewerId={userId}
        onClose={() => setListType(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85dvh] rounded-t-3xl sm:rounded-3xl border overflow-hidden flex flex-col"
        style={{ background: C.surface, borderColor: C.borderGold, color: C.ivory }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 border-b shrink-0"
          style={{ borderColor: C.border }}
        >
          <div className="font-black text-base">Insights de la story</div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-white/10"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Publication & expiration */}
          <div
            className="rounded-2xl border p-3 space-y-2"
            style={{ borderColor: C.border, background: C.surface2 }}
          >
            <div className="flex items-start gap-3">
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: C.surface }}
              >
                <Calendar size={16} style={{ color: C.gold }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Publication
                </div>
                <div className="text-sm font-bold">
                  {formatAbsoluteShort(publishedAt)}
                </div>
                <div className="text-[11px]" style={{ color: C.muted }}>
                  {formatRelativePast(publishedAt, now)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: C.surface }}
              >
                <Clock size={16} style={{ color: expired ? '#f87171' : C.teal }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold" style={{ color: C.muted }}>
                  Expiration (24 h)
                </div>
                <div className="text-sm font-bold">
                  {expiresAt ? formatAbsoluteShort(expiresAt) : '—'}
                </div>
                <div
                  className="text-[11px] font-medium"
                  style={{ color: expired ? '#f87171' : C.muted }}
                >
                  {expiresAt ? formatTimeLeft(expiresAt, now) : '—'}
                </div>
              </div>
            </div>

            {metaLine && (
              <p className="text-[11px] pt-1 border-t" style={{ borderColor: C.border, color: C.muted }}>
                {metaLine}
              </p>
            )}
          </div>

          {/* Compteurs cliquables */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setListType('storyViews')}
              className="rounded-2xl border p-3 text-left active:scale-[0.98] transition-transform"
              style={{ borderColor: C.border, background: C.surface2 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Eye size={16} style={{ color: C.gold }} />
                <span className="text-xs font-semibold" style={{ color: C.muted }}>
                  Vues
                </span>
              </div>
              <div className="text-2xl font-black">
                {typeof views === 'number' ? views : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                Voir la liste
              </div>
            </button>

            <button
              type="button"
              onClick={() => setListType('storyLikes')}
              className="rounded-2xl border p-3 text-left active:scale-[0.98] transition-transform"
              style={{ borderColor: C.border, background: C.surface2 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Heart size={16} style={{ color: '#f472b6' }} />
                <span className="text-xs font-semibold" style={{ color: C.muted }}>
                  Réactions
                </span>
              </div>
              <div className="text-2xl font-black">
                {typeof likes === 'number' ? likes : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                Voir la liste
              </div>
            </button>
          </div>

          {story.caption && (
            <div
              className="rounded-2xl border p-3"
              style={{ borderColor: C.border, background: C.surface2 }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: C.muted }}>
                Légende
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{translatedCaption || story.caption}</p>
              <div className="mt-2">
                <TranslateButton
                  text={story.caption}
                  preferredLang="fr"
                  quickLangs={["bm", "wo", "fuc", "dyu", "snk"]}
                  isTranslated={!!translatedCaption}
                  onTranslated={(value) => setTranslatedCaption(value)}
                  onClear={() => setTranslatedCaption(null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
