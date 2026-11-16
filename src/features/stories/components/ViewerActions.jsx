import { Send, Star, Trash2, BarChart3 } from 'lucide-react';
import { ReactionBar } from './ReactionBar.jsx';
import { formatOwnerStoryMeta } from '../lib/storyTime.js';

export function ViewerActions({
  story,
  isMine,
  current,
  busy,
  counts,
  onReact,
  onShare,
  onRemove,
  onOpenEngagement,
  onOpenInsights,
  onAddHighlight,
}) {
  const pill =
    'px-3 py-2 rounded-xl text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20';
  const icon =
    'p-2.5 rounded-xl bg-white/10 text-white backdrop-blur-md border border-white/20';

  const meta = isMine ? formatOwnerStoryMeta(story) : '';

  return (
    <div className="space-y-1.5">
      {isMine && meta && (
        <p className="text-[10px] text-white/70 px-0.5 leading-tight">{meta}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isMine && (
          <>
            <button
              type="button"
              onClick={() =>
                onOpenInsights
                  ? onOpenInsights(story)
                  : onOpenEngagement?.('storyViews')
              }
              className={pill}
            >
              👁 {counts ? counts.views : '—'}
            </button>
            <button
              type="button"
              onClick={() => onOpenEngagement?.('storyLikes')}
              className={pill}
            >
              ❤️ {counts ? counts.likes : '—'}
            </button>
            {onOpenInsights && (
              <button
                type="button"
                onClick={() => onOpenInsights(story)}
                className={icon}
                aria-label="Insights de la story"
                title="Insights"
              >
                <BarChart3 size={18} />
              </button>
            )}
          </>
        )}

        <ReactionBar
          current={current}
          busy={busy}
          onReact={(emoji) => onReact(story, emoji)}
        />

        <button
          type="button"
          onClick={() => onShare(story)}
          aria-label="Partager"
          className={icon}
        >
          <Send size={18} />
        </button>

        {isMine && (
          <button
            type="button"
            onClick={() => onAddHighlight(story)}
            aria-label="Ajouter aux highlights"
            className={icon}
          >
            <Star size={18} />
          </button>
        )}

        {isMine && (
          <button
            type="button"
            onClick={() => onRemove(story)}
            disabled={busy}
            aria-label="Supprimer"
            className="p-2.5 rounded-xl bg-red-500/20 text-red-300 backdrop-blur-md border border-red-500/30 ml-auto"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
