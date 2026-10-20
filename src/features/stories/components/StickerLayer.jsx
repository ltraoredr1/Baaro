import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

function useCountdown(endsAt) {
  const [left, setLeft] = useState(() => new Date(endsAt).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(endsAt).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (Number.isNaN(left) || left <= 0) return 'Terminé';
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${d > 0 ? `${d} j ` : ''}${hh}:${mm}:${ss}`;
}

const box = 'rounded-2xl px-4 py-3 bg-white/90 text-zinc-900 shadow-lg';

function Countdown({ data }) {
  const left = useCountdown(data.endsAt);
  return (
    <div className={`${box} text-center`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{data.title}</div>
      <div className="text-xl font-bold tabular-nums">{left}</div>
    </div>
  );
}

function Question({ sticker, isMine, canInteract, onAnswer, onPause }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onAnswer(sticker, t);
    setSending(false);
    if (ok) { setSent(true); setText(''); }
  };

  return (
    <div className={box}>
      <div className="text-sm font-semibold mb-2">{sticker.data.prompt}</div>
      {isMine || !canInteract ? (
        <div className="text-xs opacity-60">{isMine ? 'Les réponses arrivent dans tes notifications.' : ''}</div>
      ) : sent ? (
        <div className="text-xs font-semibold text-green-700">Réponse envoyée ✓</div>
      ) : (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => onPause(true)}
            onBlur={() => onPause(false)}
            maxLength={300}
            placeholder="Ta réponse…"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm bg-zinc-100 outline-none"
          />
          <button onClick={send} disabled={sending || !text.trim()} className="px-3 rounded-lg text-xs font-bold bg-zinc-900 text-white disabled:opacity-40">
            Envoyer
          </button>
        </div>
      )}
    </div>
  );
}

/** Affiche les stickers d'une story, empilés. `onAnswer` = (sticker, texte) => Promise<boolean>. */
export function StickerLayer({ stickers, isMine, canInteract, onAnswer, onOpenProfile, onPause }) {
  if (!stickers?.length) return null;
  return (
    <div className="flex flex-col gap-2 items-stretch">
      {stickers.map((s) => {
        if (s.type === 'question') {
          return <Question key={s.id} sticker={s} isMine={isMine} canInteract={canInteract} onAnswer={onAnswer} onPause={onPause} />;
        }
        if (s.type === 'countdown') return <Countdown key={s.id} data={s.data} />;
        if (s.type === 'location') {
          const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.data.name)}`;
          return (
            <a key={s.id} href={url} target="_blank" rel="noopener noreferrer" className={`${box} flex items-center gap-2 self-start text-sm font-semibold`}>
              <MapPin size={16} /> {s.data.name}
            </a>
          );
        }
        if (s.type === 'mention') {
          return (
            <button key={s.id} onClick={() => onOpenProfile?.(s.data.user_id, s.data.handle)} className={`${box} self-start text-sm font-bold`}>
              @{s.data.handle}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}
