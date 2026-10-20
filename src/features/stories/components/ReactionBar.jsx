import { REACTIONS } from '../constants.js';

export function ReactionBar({ current, busy, onReact }) {
  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map((emoji) => {
        const active = current === emoji;
        return (
          <button
            key={emoji}
            disabled={busy}
            onClick={() => onReact(emoji)}
            aria-label={`Réagir ${emoji}`}
            aria-pressed={active}
            className={`w-9 h-9 flex items-center justify-center text-lg rounded-xl backdrop-blur-md border transition-all active:scale-90 ${
              active ? 'bg-white/30 border-white/60 scale-110' : 'bg-white/10 border-white/20 hover:bg-white/20'
            }`}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
