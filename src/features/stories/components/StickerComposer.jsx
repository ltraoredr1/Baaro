import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { COLORS as C } from '../../../theme.js';
import { MAX_STICKERS } from '../constants.js';
import { searchProfiles } from '../api/storiesApi.js';

const TYPES = [
  { id: 'question',  label: '❓ Question' },
  { id: 'countdown', label: '⏳ Compte à rebours' },
  { id: 'location',  label: '📍 Lieu' },
  { id: 'mention',   label: '@ Mention' },
];
const LABELS = { question: '❓', countdown: '⏳', location: '📍', mention: '@' };
const input = 'w-full px-3 py-2 rounded-lg text-sm bg-black/30 border border-white/15 text-white outline-none';
const newId = () => Math.random().toString(36).substring(2, 9);

const describe = (s) =>
  s.type === 'question' ? s.data.prompt :
  s.type === 'countdown' ? s.data.title :
  s.type === 'location' ? s.data.name : `@${s.data.handle}`;

export function StickerComposer({ stickers, onAdd, onRemove, onClose }) {
  const [type, setType] = useState('question');
  const [text, setText] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const full = stickers.length >= MAX_STICKERS;

  useEffect(() => {
    if (type !== 'mention') return;
    const t = setTimeout(() => searchProfiles(query).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [query, type]);

  const reset = () => { setText(''); setEndsAt(''); setQuery(''); setResults([]); };
  const add = (sticker) => { onAdd({ id: newId(), ...sticker }); reset(); };

  const addQuestion = () => text.trim() && add({ type: 'question', data: { prompt: text.trim() } });
  const addLocation = () => text.trim() && add({ type: 'location', data: { name: text.trim() } });
  const addCountdown = () => {
    const d = new Date(endsAt);
    if (!text.trim() || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return;
    add({ type: 'countdown', data: { title: text.trim(), endsAt: d.toISOString() } });
  };

  return (
    <div className="p-3 rounded-xl border space-y-3 bg-black/30" style={{ borderColor: C.border }}>
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold" style={{ color: C.gold }}>Stickers ({stickers.length}/{MAX_STICKERS})</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={14} /></button>
      </div>

      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stickers.map((s) => (
            <span key={s.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/10 text-white max-w-full">
              <span>{LABELS[s.type]}</span>
              <span className="truncate max-w-[140px]">{describe(s)}</span>
              <button onClick={() => onRemove(s.id)} aria-label="Retirer"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {full ? (
        <p className="text-xs text-zinc-400">Maximum atteint.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setType(t.id); reset(); }}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${type === t.id ? 'bg-white/20 border-white/50 text-white' : 'border-white/15 text-zinc-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {type === 'question' && (
            <div className="space-y-2">
              <input className={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Pose ta question…" />
              <button onClick={addQuestion} className="px-3 py-1.5 rounded-lg text-xs font-bold text-black" style={{ background: C.gold }}>Ajouter</button>
            </div>
          )}

          {type === 'countdown' && (
            <div className="space-y-2">
              <input className={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={60} placeholder="Titre (ex : Lancement)" />
              <input className={input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              <button onClick={addCountdown} className="px-3 py-1.5 rounded-lg text-xs font-bold text-black" style={{ background: C.gold }}>Ajouter</button>
            </div>
          )}

          {type === 'location' && (
            <div className="space-y-2">
              <input className={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Lieu (ex : Marché Dantokpa, Cotonou)" />
              <button onClick={addLocation} className="px-3 py-1.5 rounded-lg text-xs font-bold text-black" style={{ background: C.gold }}>Ajouter</button>
            </div>
          )}

          {type === 'mention' && (
            <div className="space-y-2">
              <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un pseudo…" />
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add({ type: 'mention', data: { user_id: p.id, handle: p.handle, display_name: p.display_name } })}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white"
                >
                  <b>{p.display_name}</b> <span className="opacity-60">@{p.handle}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
