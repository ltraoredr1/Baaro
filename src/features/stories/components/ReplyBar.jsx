import { useState } from 'react';
import { Send } from 'lucide-react';

export function ReplyBar({ story, onSend, onPause }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onSend(story, t);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => onPause(true)}
        onBlur={() => onPause(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        maxLength={500}
        placeholder="Envoyer un message…"
        className="flex-1 min-w-0 px-4 py-2 rounded-full text-sm text-white placeholder-white/50 bg-white/10 border border-white/25 backdrop-blur-md outline-none focus:border-white/60"
      />
      <button
        onClick={submit}
        disabled={sending || !text.trim()}
        aria-label="Envoyer"
        className="p-2.5 rounded-full bg-white/15 text-white border border-white/25 disabled:opacity-40"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
