import { Send, Star, Trash2 } from 'lucide-react';
import { ReactionBar } from './ReactionBar.jsx';

export function ViewerActions({ story, isMine, current, busy, counts, onReact, onShare, onRemove, onOpenEngagement, onAddHighlight }) {
  const pill = 'px-3 py-2 rounded-xl text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20';
  const icon = 'p-2.5 rounded-xl bg-white/10 text-white backdrop-blur-md border border-white/20';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isMine && (
        <>
          <button onClick={() => onOpenEngagement('storyViews')} className={pill}>👁 {counts?.views || 0}</button>
          <button onClick={() => onOpenEngagement('storyLikes')} className={pill}>❤️ {counts?.likes || 0}</button>
        </>
      )}

      <ReactionBar current={current} busy={busy} onReact={(emoji) => onReact(story, emoji)} />

      <button onClick={() => onShare(story)} aria-label="Partager" className={icon}><Send size={18} /></button>

      {isMine && (
        <button onClick={() => onAddHighlight(story)} aria-label="Ajouter aux highlights" className={icon}>
          <Star size={18} />
        </button>
      )}

      {isMine && (
        <button onClick={() => onRemove(story)} disabled={busy} aria-label="Supprimer" className="p-2.5 rounded-xl bg-red-500/20 text-red-300 backdrop-blur-md border border-red-500/30 ml-auto">
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}
