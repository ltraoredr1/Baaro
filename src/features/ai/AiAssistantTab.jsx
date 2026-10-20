import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Zap,
  MessageSquare,
  Coins,
  Swords,
  Mic,
  Square,
  Volume2,
  VolumeX,
  PlusCircle,
  Video,
  Image as ImageIcon,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";

const PRESETS = [
  { icon: Coins, text: "Comment maximiser mes points aujourd'hui ?" },
  { icon: Swords, text: "Propose-moi 3 sujets de débat viraux" },
  { icon: ImageIcon, text: "Génère une image verticale pour ma story" },
  { icon: MessageSquare, text: "Idée de publication engageante" },
  { icon: Zap, text: "Analyse mon activité BAARO et donne des conseils" },
];

const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  anthropic: "Claude",
  openai: "OpenAI",
  xai: "xAI",
  moonshot: "Moonshot",
};

const HISTORY_LIMIT = 10;
const MAX_INPUT_LENGTH = 4000;
const AUTO_SPEAK = true;

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " bloc de code omis ")
    .replace(/https?:\/\/\S+/gi, " lien ")
    .replace(/[*#_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getSafeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function getProviderLabel(provider) {
  if (typeof provider !== "string" || !provider.trim()) {
    return "IA Active";
  }

  const key = provider.trim().toLowerCase();
  return PROVIDER_LABELS[key] || provider.trim();
}

export function AiAssistantTab({
  userProfile,
  onPublishAction,
  onGenerateMedia,
  prefill,
}) {
  const { showToast, showPointsReward } = useToast();

  const [messages, setMessages] = useState(() => [
    {
      id: "welcome",
      role: "assistant",
      text: `Salut ${userProfile?.display_name || "membre"} ! 👋\nJe suis l'Assistant IA de BAARO. Que souhaites-tu créer ou analyser aujourd'hui ?`,
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);

  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const speakingIdRef = useRef(null);
  const mountedRef = useRef(false);

  const stopSpeech = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // La synthèse vocale peut ne pas être disponible.
      }
    }

    speakingIdRef.current = null;

    if (mountedRef.current) {
      setSpeakingMessageId(null);
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      try {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      } catch {
        try {
          recognition.stop();
        } catch {
          // La reconnaissance peut déjà être arrêtée.
        }
      }
    }

    if (mountedRef.current) {
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;

      abortRef.current?.abort();
      abortRef.current = null;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;

      if (recognition) {
        try {
          recognition.onstart = null;
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.onend = null;
          recognition.abort();
        } catch {
          // Nettoyage best effort.
        }
      }

      if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Nettoyage best effort.
        }
      }

      speakingIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopSpeech();
        stopListening();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [stopSpeech, stopListening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (!prefill?.text) return;

    setInput(String(prefill.text).slice(0, MAX_INPUT_LENGTH));

    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [prefill?.key, prefill?.text]);

  const speakText = useCallback(
    (messageId, text, { force = false } = {}) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof window.SpeechSynthesisUtterance !== "function"
      ) {
        if (force) {
          showToast(
            "La synthèse vocale n'est pas disponible sur cet appareil",
            "error"
          );
        }
        return;
      }

      const synth = window.speechSynthesis;

      if (speakingIdRef.current === messageId) {
        stopSpeech();
        return;
      }

      stopSpeech();

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const utterance = new window.SpeechSynthesisUtterance(cleaned);
      utterance.lang = "fr-FR";
      utterance.rate = 1;
      utterance.pitch = 1;

      try {
        const voices = synth.getVoices() || [];

        const frenchVoice =
          voices.find(
            (voice) =>
              (voice.lang || "")
                .toLowerCase()
                .replace(/_/g, "-") === "fr-fr"
          ) ||
          voices.find((voice) =>
            (voice.lang || "")
              .toLowerCase()
              .startsWith("fr")
          );

        if (frenchVoice) {
          utterance.voice = frenchVoice;
        }
      } catch {
        // La voix par défaut sera utilisée.
      }

      utterance.onend = () => {
        if (speakingIdRef.current === messageId) {
          speakingIdRef.current = null;

          if (mountedRef.current) {
            setSpeakingMessageId(null);
          }
        }
      };

      utterance.onerror = () => {
        if (speakingIdRef.current === messageId) {
          speakingIdRef.current = null;

          if (mountedRef.current) {
            setSpeakingMessageId(null);
          }
        }
      };

      speakingIdRef.current = messageId;
      setSpeakingMessageId(messageId);

      try {
        synth.speak(utterance);
      } catch {
        speakingIdRef.current = null;
        setSpeakingMessageId(null);

        if (force) {
          showToast(
            "Impossible de lire cette réponse à voix haute",
            "error"
          );
        }
      }
    },
    [showToast, stopSpeech]
  );

  const toggleListening = useCallback(() => {
    if (typeof window === "undefined") {
      showToast(
        "La dictée vocale n'est pas disponible sur cet appareil",
        "error"
      );
      return;
    }

    if (recognitionRef.current) {
      stopListening();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast(
        "La dictée vocale n'est pas supportée par votre navigateur",
        "error"
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();

      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        if (mountedRef.current) {
          setIsListening(true);
        }
      };

      recognition.onresult = (event) => {
        const transcript =
          event.results?.[0]?.[0]?.transcript;

        if (!transcript || !mountedRef.current) return;

        setInput((previous) => {
          const next = previous
            ? `${previous} ${transcript}`
            : transcript;

          return next.slice(0, MAX_INPUT_LENGTH);
        });
      };

      recognition.onerror = () => {
        if (mountedRef.current) {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }

        if (mountedRef.current) {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);

      showToast("Impossible d'activer le micro", "error");
    }
  }, [showToast, stopListening]);

  const handleSend = useCallback(
    async (customText) => {
      const rawText =
        typeof customText === "string" ? customText : input;

      const query = String(rawText || "")
        .trim()
        .slice(0, MAX_INPUT_LENGTH);

      if (!query || loading || !mountedRef.current) return;

      setInput("");
      stopSpeech();
      stopListening();

      // Invalider toute requête précédente avant de la remplacer.
      const requestId = ++requestIdRef.current;

      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg = {
        id: `u_${Date.now()}_${requestId}`,
        role: "user",
        text: query,
      };

      const history = [...messages, userMsg]
        .filter((message) => !message.isError)
        .filter((message) => message.id !== "welcome")
        .slice(-HISTORY_LIMIT)
        .map((message) => ({
          role: message.role,
          content: message.text,
        }));

      setMessages((previous) => [...previous, userMsg]);
      setLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

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
            context: {
              display_name: userProfile?.display_name,
            },
          }),
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const serverMessage =
            typeof data?.error === "string" &&
            data.error.trim()
              ? data.error.trim()
              : "IA temporairement indisponible";

          throw new Error(serverMessage);
        }

        if (
          !mountedRef.current ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        if (typeof data.provider === "string") {
          setProvider(data.provider);
        }

        const replyText =
          typeof data.reply === "string" &&
          data.reply.trim()
            ? data.reply.trim()
            : "Voici une suggestion personnalisée.";

        const imageUrl = getSafeImageUrl(data.imageUrl);

        const assistantMsgId = `a_${Date.now()}_${requestId}`;

        setMessages((previous) => [
          ...previous,
          {
            id: assistantMsgId,
            role: "assistant",
            text: replyText,
            imageUrl,
            canPublish: true,
            canGenerate: true,
          },
        ]);

        if (AUTO_SPEAK) {
          speakText(assistantMsgId, replyText);
        }

        if (typeof showPointsReward === "function") {
          showPointsReward(2, "Échange avec l'IA");
        }
      } catch (error) {
        if (
          error?.name === "AbortError" ||
          controller.signal.aborted
        ) {
          return;
        }

        if (
          !mountedRef.current ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        const errorText =
          typeof error?.message === "string" &&
          error.message.trim()
            ? error.message
            : "Une erreur est survenue. Réessayez.";

        setMessages((previous) => [
          ...previous,
          {
            id: `err_${Date.now()}_${requestId}`,
            role: "assistant",
            text: errorText,
            isError: true,
          },
        ]);
      } finally {
        if (
          mountedRef.current &&
          requestId === requestIdRef.current
        ) {
          setLoading(false);

          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      }
    },
    [
      input,
      loading,
      messages,
      userProfile?.display_name,
      showPointsReward,
      speakText,
      stopSpeech,
      stopListening,
    ]
  );

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-4">
      <div
        className="rounded-2xl p-4 border flex items-center justify-between"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.borderGold,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold"
            style={{
              background: COLORS.gold,
              color: "#000",
            }}
          >
            <Bot size={20} />
          </div>

          <div>
            <h2 className="font-bold text-sm text-white">
              Assistant IA BAARO
            </h2>
            <p className="text-xs text-white/50">
              Moteur Unifié Multi-Providers
            </p>
          </div>
        </div>

        <span
          className="text-[10px] font-mono px-2 py-1 rounded-full border"
          style={{
            borderColor: COLORS.borderTeal,
            color: COLORS.teal,
          }}
        >
          {getProviderLabel(provider)}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PRESETS.map((preset) => {
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
              <PresetIcon
                size={13}
                style={{ color: COLORS.gold }}
              />
              {preset.text}
            </button>
          );
        })}
      </div>

      <div
        className="rounded-2xl border p-4 flex flex-col min-h-[320px]"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.border,
        }}
      >
        <div
          className="flex-1 overflow-y-auto space-y-4 max-h-[380px] pr-1"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((message) => {
            const isSpeaking =
              speakingMessageId === message.id;

            return (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user"
                    ? "flex-row-reverse"
                    : ""
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: message.isError
                      ? "#ef4444"
                      : message.role === "assistant"
                        ? COLORS.gold
                        : COLORS.teal,
                    color: "#000",
                  }}
                >
                  {message.role === "assistant" ? (
                    <Bot size={15} />
                  ) : (
                    <User size={15} />
                  )}
                </div>

                <div className="max-w-[80%] min-w-0 flex flex-col gap-1.5">
                  <div
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line break-words border"
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
                    {message.text}

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

                  {message.role === "assistant" &&
                    !message.isError && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            speakText(message.id, message.text, {
                              force: true,
                            })
                          }
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                          style={{
                            background: isSpeaking
                              ? `${COLORS.teal}20`
                              : COLORS.surface2,
                            borderColor: isSpeaking
                              ? COLORS.borderTeal
                              : COLORS.border,
                            color: isSpeaking
                              ? COLORS.teal
                              : COLORS.muted,
                          }}
                          aria-label={
                            isSpeaking
                              ? "Arrêter la lecture"
                              : "Écouter la réponse"
                          }
                          aria-pressed={isSpeaking}
                        >
                          {isSpeaking ? (
                            <VolumeX size={13} />
                          ) : (
                            <Volume2 size={13} />
                          )}
                          <span>
                            {isSpeaking ? "Arrêter" : "Écouter"}
                          </span>
                        </button>

                        {message.canGenerate &&
                          typeof onGenerateMedia === "function" && (
                            <button
                              type="button"
                              onClick={() =>
                                onGenerateMedia(message.text)
                              }
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

                        {message.canPublish &&
                          typeof onPublishAction === "function" && (
                            <button
                              type="button"
                              onClick={() =>
                                onPublishAction(message.text)
                              }
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                              style={{
                                background: `${COLORS.teal}20`,
                                borderColor: COLORS.borderTeal,
                                color: COLORS.teal,
                              }}
                              aria-label="Publier cette idée"
                            >
                              <PlusCircle size={13} />
                              Publier cette idée
                            </button>
                          )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: COLORS.gold }}
              role="status"
            >
              <Sparkles size={14} className="animate-spin" />
              L&apos;Assistant BAARO réfléchit...
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
          className="flex gap-2 pt-4 border-t mt-3"
          style={{ borderColor: COLORS.border }}
        >
          <button
            type="button"
            onClick={toggleListening}
            disabled={loading}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
              isListening ? "animate-pulse" : ""
            }`}
            style={{
              background: isListening
                ? `${COLORS.teal}20`
                : COLORS.surface2,
              borderColor: isListening
                ? COLORS.borderTeal
                : COLORS.border,
              color: isListening
                ? COLORS.teal
                : COLORS.ivory,
            }}
            title="Dicter par la voix"
            aria-label={
              isListening
                ? "Arrêter la dictée"
                : "Dicter par la voix"
            }
            aria-pressed={isListening}
          >
            {isListening ? (
              <Square size={16} />
            ) : (
              <Mic size={16} />
            )}
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={(event) =>
              setInput(
                event.target.value.slice(0, MAX_INPUT_LENGTH)
              )
            }
            maxLength={MAX_INPUT_LENGTH}
            placeholder={
              isListening
                ? "Écoute en cours..."
                : "Demandez du texte, une image ou une idée vidéo..."
            }
            disabled={loading}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border text-sm outline-none disabled:opacity-60"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
            aria-label="Message à l'assistant IA"
          />

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 rounded-xl font-bold disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center"
            style={{
              background: COLORS.gold,
              color: "#000",
            }}
            aria-label="Envoyer"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default AiAssistantTab;
