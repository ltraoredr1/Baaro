import {
  Bot,
  User,
  Volume2,
  VolumeX,
  PlusCircle,
  Video,
  Copy,
  RefreshCw,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { GRIOT_FOLLOWUPS } from "./aiAssistantConfig.js";
import { getSafeHttpUrl } from "./aiAssistantHelpers.js";
import { RichText } from "./AiRichText.jsx";

export function AiMessageItem({
  message,
  isGriot,
  isSpeaking,
  loading,
  onSpeak,
  onCopy,
  onRetry,
  onSend,
  onGenerateMedia,
  onPublishAction,
}) {
  const isAssistant = message.role === "assistant";
  const showActions =
    isAssistant && !message.isError && message.id !== "welcome";

  return (
    <div
      className={`flex gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: message.isError
            ? "#ef4444"
            : isAssistant
              ? COLORS.gold
              : COLORS.teal,
          color: "#000",
        }}
      >
        {isAssistant ? (
          isGriot && !message.isError ? (
            <span className="text-sm">👴</span>
          ) : (
            <Bot size={15} />
          )
        ) : (
          <User size={15} />
        )}
      </div>

      <div className="max-w-[85%] min-w-0 flex flex-col gap-1.5">
        <div
          className="px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words border"
          style={{
            background: message.isError
              ? "rgba(239,68,68,0.12)"
              : COLORS.surface2,
            color: COLORS.ivory,
            borderColor: message.isError
              ? "rgba(239,68,68,0.35)"
              : COLORS.border,
          }}
        >
          <RichText text={message.text} />

          {message.sources?.length > 0 && (
            <div className="mt-3 pt-2 border-t border-white/10 space-y-1">
              <p className="text-[10px] font-semibold text-white/50">
                Sources vérifiées maintenant
              </p>
              {message.sources.slice(0, 5).map((source, index) => {
                const href = getSafeHttpUrl(source?.url);
                if (!href) return null;
                return (
                  <a
                    key={`${href}-${index}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[11px] underline underline-offset-2 truncate"
                    style={{ color: COLORS.teal }}
                  >
                    [{index + 1}] {source.title || href}
                  </a>
                );
              })}
            </div>
          )}

          {message.imageUrl && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
              <img
                src={message.imageUrl}
                alt="Visuel généré par l'IA"
                className="w-full max-h-64 object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        {message.isError && message.retryText && (
          <button
            type="button"
            onClick={() => onRetry(message.retryText)}
            disabled={loading}
            className="self-start flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          >
            <RefreshCw size={12} />
            Réessayer
          </button>
        )}

        {showActions && isGriot && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {GRIOT_FOLLOWUPS.map((followup) => (
              <button
                key={followup.label}
                type="button"
                onClick={() => onSend(followup.prompt)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: `${COLORS.gold}12`,
                  borderColor: COLORS.borderGold,
                  color: COLORS.gold,
                }}
              >
                {followup.label}
              </button>
            ))}
          </div>
        )}

        {showActions && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onSpeak(message.id, message.text, { force: true })}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
              style={{
                background: isSpeaking ? `${COLORS.teal}20` : COLORS.surface2,
                borderColor: isSpeaking ? COLORS.borderTeal : COLORS.border,
                color: isSpeaking ? COLORS.teal : COLORS.muted,
              }}
              aria-label={isSpeaking ? "Arrêter la lecture" : "Écouter la réponse"}
              aria-pressed={isSpeaking}
            >
              {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
              <span>{isSpeaking ? "Arrêter" : "Écouter"}</span>
            </button>

            <button
              type="button"
              onClick={() => onCopy(message.text)}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.muted,
              }}
              aria-label="Copier la réponse"
            >
              <Copy size={12} />
              Copier
            </button>

            {message.canGenerate && typeof onGenerateMedia === "function" && (
              <button
                type="button"
                onClick={() => onGenerateMedia(message.text)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                style={{
                  background: `${COLORS.gold}20`,
                  borderColor: COLORS.borderGold,
                  color: COLORS.gold,
                }}
                aria-label="Créer un visuel à partir de cette idée"
              >
                <Video size={13} />
                Créer le visuel
              </button>
            )}

            {message.canPublish && typeof onPublishAction === "function" && (
              <button
                type="button"
                onClick={() => onPublishAction(message.text)}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                style={{
                  background: `${COLORS.teal}20`,
                  borderColor: COLORS.borderTeal,
                  color: COLORS.teal,
                }}
                aria-label="Publier cette idée"
              >
                <PlusCircle size={13} />
                Publier
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AiMessageItem;
