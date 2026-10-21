import { COLORS as C } from '../../../theme.js';
import { RichTextRenderer } from '../../../components/RichTextRenderer.jsx';
import { AutoTranslate } from '../../../components/TranslatedText.jsx';

export function StoryCard({ story: s, isMine, counts, onOpen }) {
  const hasMedia = s.media_url && s.media_type !== 'text';
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-2xl overflow-hidden border min-h-48 p-3 flex flex-col justify-between active:scale-[0.98] transition-all hover:shadow-lg relative group"
      style={{ background: s.background || C.surface, borderColor: C.border, color: C.ivory }}
    >
      <div className="z-10">
        <b className="truncate block">{s.profiles?.display_name || 'Membre'}</b>
        <div className="text-xs opacity-70">@{s.profiles?.handle || ''}</div>
      </div>

      {hasMedia ? (
        // Vignette 4:5 : l'image est affichée en entier (object-contain), sans zoom ni rognage.
        // Le fond flouté de la même image remplit les bandes.
        <div className="relative w-full aspect-[4/5] rounded-lg my-2 overflow-hidden bg-black/40">
          {s.media_type === 'video' ? (
            <video
              src={s.media_url}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <>
              <img
                src={s.media_url}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40 pointer-events-none"
              />
              <img
                src={s.media_url}
                alt="story"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </>
          )}
        </div>
      ) : (
        <div className="text-sm line-clamp-4 my-auto">
          <AutoTranslate text={s.caption} showToggle={false}>
            {(txt) => <RichTextRenderer content={txt} />}
          </AutoTranslate>
        </div>
      )}

      {s.product?.name && (
        <div className="my-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] truncate text-amber-400">🛍️ {s.product.name}</div>
      )}
      {s.poll?.question && (
        <div className="my-1 px-2 py-1 rounded bg-teal-500/10 border border-teal-500/20 text-[11px] truncate" style={{ color: C.teal || '#2dd4bf' }}>📊 {s.poll.question}</div>
      )}

      <div className="text-[10px] opacity-60 flex items-center justify-between gap-2 z-10">
        <span>{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {isMine && <span>👁 {counts?.views || 0} · ❤️ {counts?.likes || 0}</span>}
      </div>
    </button>
  );
}
