import { CalendarClock } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { MAX_SCHEDULE_DAYS } from '../constants.js';

const toLocalInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** value = '' (publier maintenant) ou valeur datetime-local. */
export function ScheduleField({ value, onChange }) {
  const min = toLocalInput(new Date(Date.now() + 5 * 60_000));
  const max = toLocalInput(new Date(Date.now() + MAX_SCHEDULE_DAYS * 86_400_000));
  const on = value !== '';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(on ? '' : min)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all hover:bg-white/5"
        style={{ borderColor: C.border, color: on ? C.gold : C.ivory }}
      >
        <CalendarClock size={16} />
        <span className="text-sm">{on ? 'Annuler la programmation' : 'Programmer'}</span>
      </button>
      {on && (
        <input
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm bg-black/30 border border-white/15 text-white"
        />
      )}
    </div>
  );
}
