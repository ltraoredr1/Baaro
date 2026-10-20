/**
 * src/features/messaging/components/MessageBubble.jsx
 * Bulle de message : texte, image (agrandissable), vidéo, vocal (lecteur), fichier, supprimé,
 * réponse citée, réactions, favori / épingle, menu d'actions, envoi en cours / échec + réessayer.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Play, Pause, FileText, X, MoreHorizontal, Reply, Copy, Trash2, Star, Pin,
} from "lucide-react";
import { CHAT_REACTIONS } from "../lib/chatFeatures.js";

/** Texte court décrivant un message (aperçu dans les citations et la barre de réponse) */
export function messagePreviewText(m) {
  if (!m) return "";
  if (m.deleted_at) return "Message supprimé";
  if (m.type && m.type !== "text" && m.media_url) {
    if (m.type === "voice") return "🎤 Message vocal";
    if (m.type === "image") return "📷 Photo";
    if (m.type === "video") return "🎬 Vidéo";
    return `📎 ${m.file_name || "Fichier"}`;
  }
  return (m.plaintext ?? "").slice(0, 100) || "…";
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

const SPEEDS = [1, 1.5, 2];

function VoicePlayer({ src, duration, isMe }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(Number(duration) || 0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    return () => {
      if (a) a.pause();
    };
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) {
        await a.play();
      } else {
        a.pause();
      }
    } catch {
      setError(true);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * total;
    setCurrent(a.currentTime);
  };

  const progress = total ? Math.min(100, (current / total) * 100) : 0;

  if (error) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="underline text-xs">
        Lecture impossible — ouvrir le vocal
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[190px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          // Les .webm enregistrés par MediaRecorder renvoient souvent Infinity : on garde media_duration
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Lecture"}
        className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center ${
          isMe ? "bg-white/20" : "bg-[#D9AE52] text-[#0B1220]"
        }`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div
          onClick={seek}
          className={`h-1.5 rounded-full cursor-pointer ${isMe ? "bg-white/25" : "bg-black/15 dark:bg-white/15"}`}
        >
          <div
            className={`h-full rounded-full ${isMe ? "bg-white" : "bg-[#D9AE52]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1 opacity-70">
          <span>{formatDuration(playing || current ? current : total)}</span>
          {total > 0 && <span>{formatDuration(total)}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={cycleSpeed}
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-black/15"
        aria-label="Vitesse de lecture"
      >
        {SPEEDS[speedIdx]}x
      </button>
    </div>
  );
}

/**
 * Props :
 *  - message, isMe, domId (id HTML pour « aller au message »)
 *  - reply : { name, text } | null — contenu cité si message.reply_to_id (null = message d'origine introuvable)
 *  - reactions : [{ emoji, count, mine }], starred, pinned
 *  - onRetry(message), onReply(message), onDelete(message), onReact(message, emoji), onStar(message), onPin(message)
 */
export function MessageBubble({
  message,
  isMe,
  domId,
  reply,
  reactions = [],
  starred = false,
  pinned = false,
  onRetry,
  onReply,
  onDelete,
  onReact,
  onStar,
  onPin,
}) {
  const [lightbox, setLightbox] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isExpired = message.expired;
  const isDeleted = !!message.deleted_at;
  const isMedia = !isDeleted && message.type && message.type !== "text" && message.media_url;
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const body = message.plaintext ?? message.content ?? message.text;
  const textToShow = isDeleted
    ? "Message supprimé"
    : body || "🔒 Message chiffré (impossible à déchiffrer)";

  const pending = message.pending || message.sending;
  const read = isMe && (message.read_at || message.read);
  const isTmpId = String(message.id || "").startsWith("tmp-");
  const canAct = !pending && !message.failed && !isDeleted && !isTmpId;
  const canCopy = !isMedia && !isDeleted && !!body;
  const hasMenu = onReply || onDelete || onReact || onStar || onPin || canCopy;

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible */
    }
    setMenuOpen(false);
  };

  const pill = "flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-[#F5F3EF]";

  return (
    <div id={domId} className={`flex ${isMe ? "justify-end" : "justify-start"} px-3 py-1`}>
      <div className={`flex flex-col max-w-[78%] min-w-0 ${isMe ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            isMe
              ? "bg-blue-600 text-white rounded-br-sm"
              : "bg-zinc-100 dark:bg-zinc-800 rounded-bl-sm"
          } ${isExpired || isDeleted ? "opacity-50 italic" : ""}`}
        >
          {message.reply_to_id && !isDeleted && (
            <div
              className={`mb-1.5 pl-2 pr-2 py-1 border-l-2 rounded-sm text-xs not-italic ${
                isMe ? "border-white/60 bg-white/10" : "border-[#D9AE52] bg-black/5 dark:bg-white/5"
              }`}
            >
              {reply ? (
                <>
                  <p className="font-semibold opacity-80 truncate">{reply.name}</p>
                  <p className="opacity-75 truncate">{reply.text}</p>
                </>
              ) : (
                <p className="opacity-70 italic">Message d'origine indisponible</p>
              )}
            </div>
          )}

          {isMedia ? (
            message.type === "image" ? (
              <>
                <img
                  src={message.media_url}
                  alt={message.file_name || "Photo"}
                  loading="lazy"
                  onClick={() => setLightbox(true)}
                  className="rounded-lg max-w-full max-h-72 cursor-zoom-in"
                />
                {lightbox && (
                  <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
                    onClick={() => setLightbox(false)}
                    role="dialog"
                    aria-modal="true"
                  >
                    <button
                      type="button"
                      className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white"
                      aria-label="Fermer"
                    >
                      <X size={22} />
                    </button>
                    <img src={message.media_url} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
              </>
            ) : message.type === "video" ? (
              <video src={message.media_url} controls preload="metadata" className="rounded-lg max-w-full max-h-72" />
            ) : message.type === "voice" ? (
              <VoicePlayer src={message.media_url} duration={message.media_duration} isMe={isMe} />
            ) : (
              <a
                href={message.media_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 underline-offset-2 hover:underline"
              >
                <FileText size={22} className="flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{message.file_name || "Fichier"}</span>
                  {message.media_size ? (
                    <span className="block text-[10px] opacity-70">{formatSize(message.media_size)}</span>
                  ) : null}
                </span>
              </a>
            )
          ) : (
            <p className="whitespace-pre-wrap break-words">{textToShow}</p>
          )}

          <div className={`text-[10px] mt-1 flex gap-1.5 items-center ${isMe ? "text-white/70 justify-end" : "opacity-50"}`}>
            {pinned && <Pin size={11} aria-label="Épinglé" />}
            {starred && <Star size={11} fill="currentColor" aria-label="Favori" />}
            <span>{time}</span>
            {isMe && !message.failed && (pending ? <span>⏳</span> : <span>{read ? "✓✓" : "✓"}</span>)}
            {message.failed && (
              <button type="button" onClick={() => onRetry?.(message)} className="underline text-red-200">
                Échec — réessayer
              </button>
            )}
            {canAct && hasMenu && (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Actions du message"
                aria-expanded={menuOpen}
                className="p-0.5 rounded hover:bg-black/10"
              >
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        </div>

        {reactions.length > 0 && !isDeleted && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                disabled={!canAct || !onReact}
                onClick={() => onReact?.(message, r.emoji)}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  r.mine ? "border-[#D9AE52] bg-[#D9AE52]/20 text-[#F5F3EF]" : "border-white/15 bg-white/5 text-[#F5F3EF]"
                }`}
                aria-label={`${r.emoji} ${r.count}`}
              >
                {r.emoji}
                {r.count > 1 ? ` ${r.count}` : ""}
              </button>
            ))}
          </div>
        )}

        {(menuOpen || copied) && canAct && (
          <div className={`flex flex-col gap-1 mt-1 text-xs ${isMe ? "items-end" : "items-start"}`}>
            {onReact && menuOpen && (
              <div className="flex flex-wrap gap-0.5 px-2 py-1 rounded-2xl bg-white/10 max-w-[260px]">
                {CHAT_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(message, emoji);
                      setMenuOpen(false);
                    }}
                    className="text-lg leading-none p-1 rounded-full hover:bg-white/10"
                    aria-label={`Réagir ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {onReply && (
                <button
                  type="button"
                  onClick={() => {
                    onReply(message);
                    setMenuOpen(false);
                  }}
                  className={pill}
                >
                  <Reply size={12} /> Répondre
                </button>
              )}
              {canCopy && (
                <button type="button" onClick={copyText} className={pill}>
                  <Copy size={12} /> {copied ? "Copié" : "Copier"}
                </button>
              )}
              {onStar && (
                <button
                  type="button"
                  onClick={() => {
                    onStar(message);
                    setMenuOpen(false);
                  }}
                  className={pill}
                >
                  <Star size={12} fill={starred ? "currentColor" : "none"} /> {starred ? "Retirer favori" : "Favori"}
                </button>
              )}
              {onPin && (
                <button
                  type="button"
                  onClick={() => {
                    onPin(message);
                    setMenuOpen(false);
                  }}
                  className={pill}
                >
                  <Pin size={12} /> {pinned ? "Désépingler" : "Épingler"}
                </button>
              )}
              {isMe && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(message);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 text-red-300"
                >
                  <Trash2 size={12} /> Supprimer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
