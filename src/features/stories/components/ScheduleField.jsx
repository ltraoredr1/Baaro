import { CalendarClock } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';

export function ScheduledList({ items, onCancel }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl p-3 border space-y-2" style={{ background: C.surface, borderColor: C.border }}>
      <div className="flex items-center gap-2 text-xs font-bold" style={{ color: C.gold }}>
        <CalendarClock size={14} /> Stories programmées ({items.length})
      </div>
      {items.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2 text-xs" style={{ color: C.ivory }}>
          <span className="truncate">
            {new Date(s.publish_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            {' · '}
            {s.caption?.trim() ? s.caption.slice(0, 30) : s.media_type === 'text' ? 'Story' : s.media_type}
          </span>
          <button onClick={() => window.confirm('Annuler cette programmation ?') && onCancel(s)} className="text-red-300 underline shrink-0">
            Annuler
          </button>
        </div>
      ))}
    </div>
  );
}
