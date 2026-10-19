import { Heart, Send, Trash2 } from 'lucide-react';

export function ViewerActions({ story, isMine, liked, busy, counts, onReact, onShare, onRemove, onOpenEngagement }) {
  const pill = 'px-3 py-2 rounded-xl text-xs text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20';
  return (
    <div className="absolute bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center gap-2">
      {isMine && (
        <>
          <button onClick={() => onOpenEngagement('storyViews')} className={pill}>👁 {counts?.views || 0}</button>
          <button onClick={() => onOpenEngagement('storyLikes')} className={pill}>❤️ {counts?.likes || 0}</button>
        </>
      )}

      <button
        onClick={() => onReact(story)}
        disabled={busy}
        className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${liked ? 'bg-red-500 border-red-500 text-white' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
      >
        <Heart size={18} fill={liked ? 'currentColor' : 'transparent'} />
      </button>

      <button onClick={() => onShare(story)} className="p-2.5 rounded-xl bg-white/10 text-white backdrop-blur-md border border-white/20">
        <Send size={18} />
      </button>

      {isMine && (
        <button onClick={() => onRemove(story)} disabled={busy} className="p-2.5 rounded-xl bg-red-500/20 text-red-300 backdrop-blur-md border border-red-500/30 ml-auto">
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}
