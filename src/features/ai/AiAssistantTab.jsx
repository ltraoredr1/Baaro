import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Sparkles,
  Send,
  Bot,
  Mic,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";
import { useSettings } from "../../hooks/useSettings.js";
import {
  GRIOT_KEY,
  GRIOT_VOICE_KEY,
  GRIOT_VOICE_LABELS,
  GRIOT_VOICE_PROFILES,
  HISTORY_LIMIT,
  MAX_INPUT_LENGTH,
  PRESETS_GRIOT,
  PRESETS_NORMAL,
  REQUEST_TIMEOUT_MS,
  STORAGE_PREFIX,
  STORED_LIMIT,
} from "./aiAssistantConfig.js";
import {
  getProviderLabel,
  getSafeHttpUrl,
  isTouchDevice,
  loadStoredMessages,
  makeWelcome,
  readGriotMode,
  readGriotVoice,
  resolveAssistantName,
} from "./aiAssistantHelpers.js";
import { useAiVoice } from "./useAiVoice.js";
import { AiMessageItem } from "./AiMessageItem.jsx";

export function AiAssistantTab({
  userProfile,
  onPublishAction,
  onGenerateMedia,
  prefill,
}) {
  const { showToast, showPointsReward } = useToast();
  const { settings } = useSettings();

  const displayName = useMemo(
    () => resolveAssistantName(userProfile),
    [userProfile]
  );

  // Mode Griot : conversation séparée de l'assistant normal
  const [isGriot, setIsGriot] = useState(readGriotMode);
  const [griotVoice, setGriotVoice] = useState(readGriotVoice);

  const baseKey = useMemo(
    () =>
      `${STORAGE_PREFIX}${userProfile?.id || userProfile?.user_id || "anon"}`,
    [userProfile?.id, userProfile?.user_id]
  );
  const storageKey = isGriot ? `${baseKey}_griot` : baseKey;

  const [messages, setMessages] = useState(() =>
    loadStoredMessages(storageKey, displayName, isGriot)
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  const presets = settings.ai_suggest
    ? isGriot
      ? PRESETS_GRIOT
      : PRESETS_NORMAL
    : [];

  /* ----- Voix (lecture + dictée) ----- */

  const appendTranscript = useCallback((transcript) => {
    setInput((previous) =>
      (previous ? `${previous} ${transcript}` : transcript).slice(
        0,
        MAX_INPUT_LENGTH
      )
    );
  }, []);

  const {
    autoSpeak,
    speakingMessageId,
    isListening,
    speakText,
    stopSpeech,
    stopListening,
    toggleAutoSpeak,
    toggleListening,
  } = useAiVoice({
    isGriot,
    griotVoice,
    onTranscript: appendTranscript,
    showToast,
  });

  /* ----- Cycle de vie ----- */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!displayName || displayName === "ami") return;
    setMessages((previous) => {
      if (previous.length !== 1 || previous[0]?.id !== "welcome") return previous;
      return [makeWelcome(displayName, isGriot)];
    });
  }, [displayName, isGriot]);

  /* ----- Persistance de la conversation ----- */

  useEffect(() => {
    try {
      const toStore = messages.filter((m) => !m.isError).slice(-STORED_LIMIT);
      if (toStore.length <= 1) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(toStore));
      }
    } catch {
      // Stockage indisponible ou plein.
    }
  }, [messages, storageKey]);

  /* ----- Scroll, prefill, auto-resize ----- */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (!prefill?.text) return;
    setInput(String(prefill.text).slice(0, MAX_INPUT_LENGTH));
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeoutId);
  }, [prefill?.key, prefill?.text]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  /* ----- Actions sur les messages ----- */

  const copyMessage = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Réponse copiée", "success");
      } catch {
        showToast("Impossible de copier", "error");
      }
    },
    [showToast]
  );

  const stopGeneration = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (mountedRef.current) setLoading(false);
  }, []);

  const resetConversation = useCallback(() => {
    stopGeneration();
    stopSpeech();
    stopListening();
    setInput("");
    setMessages([makeWelcome(displayName, isGriot)]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignoré.
    }
  }, [
    stopGeneration,
    stopSpeech,
    stopListening,
    displayName,
    isGriot,
    storageKey,
  ]);

  /* ----- Mode Griot ----- */

  const toggleGriot = useCallback(() => {
    stopGeneration();
    stopSpeech();
    stopListening();
    setInput("");

    const next = !isGriot;
    try {
      localStorage.setItem(GRIOT_KEY, next ? "1" : "0");
    } catch {
      // Ignoré.
    }

    // Les deux états changent dans le même rendu : la conversation de
    // l'autre mode est rechargée sans écraser celle qu'on quitte.
    setIsGriot(next);
    setMessages(
      loadStoredMessages(
        next ? `${baseKey}_griot` : baseKey,
        displayName,
        next
      )
    );
  }, [
    isGriot,
    baseKey,
    displayName,
    stopGeneration,
    stopSpeech,
    stopListening,
  ]);

  const changeGriotVoice = useCallback((voice) => {
    if (!GRIOT_VOICE_PROFILES[voice]) return;
    setGriotVoice(voice);
    try {
      localStorage.setItem(GRIOT_VOICE_KEY, voice);
    } catch {
      // Ignoré.
    }
  }, []);

  /* ----- Envoi ----- */

  const handleSend = useCallback(
    async (customText, { retry = false } = {}) => {
      const rawText = typeof customText === "string" ? customText : input;
      const query = String(rawText || "")
        .trim()
        .slice(0, MAX_INPUT_LENGTH);

      if (!query || loading || !mountedRef.current) return;

      if (!retry) setInput("");
      stopSpeech();
      stopListening();

      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      const userMsg = {
        id: `u_${Date.now()}_${requestId}`,
        role: "user",
        text: query,
      };

      const baseMessages = retry
        ? messages.filter((m) => !m.isError)
        : [...messages.filter((m) => !m.isError), userMsg];

      const history = baseMessages
        .filter((m) => m.id !== "welcome")
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.text }));

      setMessages((previous) =>
        retry
          ? previous.filter((m) => !m.isError)
          : [...previous.filter((m) => !m.isError), userMsg]
      );
      setLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.access_token) {
          throw new Error(
            "Session expirée. Reconnectez-vous pour utiliser l'assistant."
          );
        }

        const response = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: history,
            // Mode Griot : le serveur (api/live.js) choisit lui-même le prompt
            mode: isGriot ? "griot" : "chat",
            context: {
              display_name: displayName,
              language: settings.lang || "fr",
              ai_region: settings.ai_region || "auto",
              privacy_ai: settings.privacy_ai !== false,
              app: "BAARO",
              griot_voice: isGriot ? griotVoice : undefined,
            },
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const serverMessage =
            typeof data?.error === "string" && data.error.trim()
              ? data.error.trim()
              : response.status === 429
                ? "Trop de demandes, patiente quelques secondes."
                : "IA temporairement indisponible";
          throw new Error(serverMessage);
        }

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        if (typeof data.provider === "string") setProvider(data.provider);

        const replyText =
          typeof data.reply === "string" && data.reply.trim()
            ? data.reply.trim()
            : "Voici une suggestion personnalisée.";

        const imageUrl = getSafeHttpUrl(data.imageUrl);
        const assistantMsgId = `a_${Date.now()}_${requestId}`;

        setMessages((previous) => [
          ...previous,
          {
            id: assistantMsgId,
            role: "assistant",
            text: replyText,
            imageUrl,
            sources: Array.isArray(data.sources) ? data.sources : [],
            canPublish: true,
            canGenerate: true,
          },
        ]);

        if (autoSpeak) speakText(assistantMsgId, replyText);

        if (typeof showPointsReward === "function") {
          showPointsReward(2, "Échange avec l'IA");
        }
      } catch (error) {
        if (
          !timedOut &&
          (error?.name === "AbortError" || controller.signal.aborted)
        ) {
          return;
        }

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        const errorText = timedOut
          ? "L'IA met trop de temps à répondre. Réessaie."
          : typeof error?.message === "string" && error.message.trim()
            ? error.message
            : "Une erreur est survenue. Réessayez.";

        setMessages((previous) => [
          ...previous,
          {
            id: `err_${Date.now()}_${requestId}`,
            role: "assistant",
            text: errorText,
            isError: true,
            retryText: query,
          },
        ]);
      } finally {
        clearTimeout(timeoutId);
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
          if (abortRef.current === controller) abortRef.current = null;
        }
      }
    },
    [
      input,
      loading,
      messages,
      displayName,
      isGriot,
      griotVoice,
      autoSpeak,
      showPointsReward,
      speakText,
      stopSpeech,
      stopListening,
      settings.lang,
      settings.ai_region,
      settings.privacy_ai,
    ]
  );

  const handleRetry = useCallback(
    (text) => handleSend(text, { retry: true }),
    [handleSend]
  );

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing &&
      !isTouchDevice()
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  const hasConversation = messages.length > 1;

  /* ----- Rendu ----- */

  return (
    <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full pb-4">
      {/* En-tête */}
      <div
        className="rounded-2xl p-3 border flex items-center gap-3"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          {isGriot ? <span className="text-xl">👩🏾</span> : <Bot size={20} />}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm text-white truncate">
            {isGriot ? "Fa-Baaro, la Griotte" : "Assistant IA BAARO"}
          </h2>
          <p className="text-xs text-white/50 truncate">
            {isGriot ? "Voix féminines du Mandé" : "Multi-IA intelligent"}
          </p>
        </div>

        <span
          className="text-[10px] font-mono px-2 py-1 rounded-full border whitespace-nowrap shrink-0"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}
        >
          {getProviderLabel(provider, isGriot)}
        </span>

        <button
          type="button"
          onClick={toggleGriot}
          className="px-2.5 py-2 rounded-lg border shrink-0 text-xs font-semibold transition-all active:scale-95"
          style={{
            background: isGriot ? `${COLORS.gold}25` : COLORS.surface2,
            borderColor: isGriot ? COLORS.borderGold : COLORS.border,
            color: isGriot ? COLORS.gold : COLORS.muted,
          }}
          aria-pressed={isGriot}
          aria-label={isGriot ? "Quitter le mode Griot" : "Activer le mode Griot"}
          title="Mode Griot"
        >
          👩🏾 Griotte
        </button>

        <button
          type="button"
          onClick={toggleAutoSpeak}
          className="p-2 rounded-lg border shrink-0 transition-all active:scale-95"
          style={{
            background: autoSpeak ? `${COLORS.teal}20` : COLORS.surface2,
            borderColor: autoSpeak ? COLORS.borderTeal : COLORS.border,
            color: autoSpeak ? COLORS.teal : COLORS.muted,
          }}
          aria-label={
            autoSpeak ? "Désactiver la lecture auto" : "Activer la lecture auto"
          }
          aria-pressed={autoSpeak}
          title="Lecture vocale automatique"
        >
          {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>

        {hasConversation && (
          <button
            type="button"
            onClick={resetConversation}
            className="p-2 rounded-lg border shrink-0 transition-all active:scale-95"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.muted,
            }}
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Voix du Griot */}
      {isGriot && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Object.entries(GRIOT_VOICE_LABELS).map(([key, label]) => {
            const active = griotVoice === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => changeGriotVoice(key)}
                aria-pressed={active}
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95"
                style={{
                  background: active ? `${COLORS.gold}25` : COLORS.surface,
                  borderColor: active ? COLORS.borderGold : COLORS.border,
                  color: active ? COLORS.gold : COLORS.muted,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Suggestions */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {presets.map((preset) => {
          const PresetIcon = preset.icon;
          return (
            <button
              key={preset.text}
              type="button"
              onClick={() => handleSend(preset.text)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap shrink-0 hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            >
              <PresetIcon size={13} style={{ color: COLORS.gold }} />
              {preset.text}
            </button>
          );
        })}
      </div>

      {/* Conversation */}
      <div
        className="rounded-2xl border p-3 flex flex-col"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
      >
        <div
          className="overflow-y-auto space-y-4 min-h-[180px] max-h-[48vh] pr-1"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((message) => (
            <AiMessageItem
              key={message.id}
              message={message}
              isGriot={isGriot}
              isSpeaking={speakingMessageId === message.id}
              loading={loading}
              onSpeak={speakText}
              onCopy={copyMessage}
              onRetry={handleRetry}
              onSend={handleSend}
              onGenerateMedia={onGenerateMedia}
              onPublishAction={onPublishAction}
            />
          ))}

          {loading && (
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: COLORS.gold }}
              role="status"
            >
              <Sparkles size={14} className="animate-spin" />
              {isGriot
                ? "Fa-Baaro réfléchit..."
                : "L'Assistant BAARO réfléchit..."}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Saisie */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2 pt-3 border-t mt-3"
          style={{ borderColor: COLORS.border }}
        >
          <button
            type="button"
            onClick={toggleListening}
            disabled={loading}
            className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
              isListening ? "animate-pulse" : ""
            }`}
            style={{
              background: isListening ? `${COLORS.teal}20` : COLORS.surface2,
              borderColor: isListening ? COLORS.borderTeal : COLORS.border,
              color: isListening ? COLORS.teal : COLORS.ivory,
            }}
            aria-label={isListening ? "Arrêter la dictée" : "Dicter par la voix"}
            aria-pressed={isListening}
          >
            {isListening ? <Square size={16} /> : <Mic size={16} />}
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(event) =>
              setInput(event.target.value.slice(0, MAX_INPUT_LENGTH))
            }
            onKeyDown={handleKeyDown}
            maxLength={MAX_INPUT_LENGTH}
            placeholder={
              isListening
                ? "Écoute en cours..."
                : isGriot
                  ? "Parle au Griot…"
                  : "Écris ton message…"
            }
            disabled={loading}
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border text-sm outline-none resize-none disabled:opacity-60"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
              maxHeight: 120,
            }}
            aria-label="Message à l'assistant IA"
          />

          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-2.5 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95"
              style={{
                background: "rgba(239,68,68,0.15)",
                borderColor: "rgba(239,68,68,0.4)",
                color: "#ef4444",
              }}
              aria-label="Arrêter la génération"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2.5 rounded-xl font-bold disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center shrink-0"
              style={{ background: COLORS.gold, color: "#000" }}
              aria-label="Envoyer"
            >
              <Send size={16} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default AiAssistantTab;
