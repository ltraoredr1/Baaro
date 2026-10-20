import { BACKGROUNDS } from '../constants.js';

/** Fond coloré / dégradé pour les stories texte. */
export function BackgroundPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs text-zinc-400 shrink-0">Fond</span>
      {BACKGROUNDS.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onChange(b.value)}
          aria-label={`Fond ${b.label}`}
          className={`w-8 h-8 rounded-full shrink-0 border-2 transition ${value === b.value ? 'border-white scale-110' : 'border-white/20'}`}
          style={{ background: b.value || 'transparent' }}
        >
          {!b.value && <span className="text-[10px] text-zinc-300">∅</span>}
        </button>
      ))}
    </div>
  );
}
