import { QUICK_REPLIES } from '../hooks/useStoryActions.js';

/** Rangée de réponses rapides en un tap (stories des autres uniquement). */
export function QuickReplies({ story, busy, onSend }) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Réponses rapides"
    >
      {QUICK_REPLIES.map((txt) => (
        <button
          key={txt}
          type="button"
          disabled={busy}
          onClick={() => onSend(story, txt)}
          className="shrink-0 px-3 py-1.5 rounded-full text-sm bg-white/10 text-white border border-white/20 active:scale-95 disabled:opacity-50"
        >
          {txt}
        </button>
      ))}
    </div>
  );
}
