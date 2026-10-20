import { useState } from 'react';
import { X } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';

/** Fenêtre « Ajouter aux highlights ». `highlights` = valeur de useHighlights. */
export function HighlightPicker({ story, highlights, onClose }) {
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: okText }); setTitle(''); }
    catch (e) { setMsg({ ok: false, text: e.message || 'Erreur' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full sm:w-[380px] rounded-t-2xl sm:rounded-2xl p-4 space-y-3 border" style={{ background: C.surface, borderColor: C.border, color: C.ivory }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <b className="text-sm">⭐ Ajouter aux highlights</b>
          <button onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        {highlights.list.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {highlights.list.map((h) => (
              <button
                key={h.id}
                disabled={busy}
                onClick={() => run(() => highlights.addStory(h.id, story), `Ajoutée à « ${h.title} »`)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 flex justify-between disabled:opacity-50"
              >
                <span className="truncate">{h.title}</span>
                <span className="opacity-60 text-xs">{h.items.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
            placeholder="Nouveau highlight (ex : Catalogue)"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-black/30 border border-white/15 text-white outline-none"
          />
          <button
            disabled={busy || !title.trim()}
            onClick={() => run(() => highlights.create(title, story), 'Highlight créé')}
            className="px-3 rounded-lg text-xs font-bold text-black disabled:opacity-40"
            style={{ background: C.gold }}
          >
            Créer
          </button>
        </div>

        {msg && <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-300'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
