import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Copy,
  RotateCcw,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";

const PRESETS_NORMAL = [
  { icon: Coins, text: "Comment maximiser mes points aujourd'hui ?" },
  { icon: Swords, text: "Propose-moi 3 sujets de débat viraux" },
  { icon: ImageIcon, text: "Génère une image verticale pour ma story" },
  { icon: MessageSquare, text: "Idée de publication engageante" },
  { icon: Zap, text: "Analyse mon activité BAARO et donne des conseils" },
];
const PRESETS_GRIOT = [
  { icon: MessageSquare, text: "Griot, donne-moi un conseil pour aujourd'hui" },
  { icon: Swords, text: "Griot, un proverbe pour mon cœur brisé ?" },
  { icon: Coins, text: "Griot, comment régler une palabre entre amis ?" },
  { icon: Zap, text: "Griot, raconte-moi l'histoire de Soundiata" },
  { icon: ImageIcon, text: "Griot, bénis ma journée en Bambara" },
];
const GRIOT_SYSTEM_PROMPT = `Tu es FA-BAARO, le Griot de BAARO. Vieux sage malien du Mandé, 80 ans. Commence TOUJOURS par "I ko, ..." (proverbe bambara). Parle Bambara + Français mélangé, comme un vieux paternel. Raconte mini-histoire avant conseil. Finis par "Alors, qu'en pense ton cœur, mon enfant ?" Tu n'es PAS une IA, tu es le Griot.`;

const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  anthropic: "Claude",
  openai: "OpenAI",
  xai: "xAI",
  moonshot: "Moonshot",
};

const HISTORY_LIMIT = 12;
const STORED_LIMIT = 50;
const MAX_INPUT_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = 45000;
const STORAGE_PREFIX = "baaro_ai_chat_v1_";
const SPEAK_KEY = "baaro_ai_autospeak";
const GRIOT_KEY = "baaro_griot_mode";

/* ---------- Utilitaires ---------- */

// Prononciations phonétiques pour la synthèse vocale (modifiables ici).
// Le texte affiché reste inchangé : seule la voix utilise ces remplacements.
const SPEECH_PRONUNCIATIONS = [
  { pattern: /\bB\.?A\.?A\.?R\.?O\b/gi, spoken: "Barreau" },
  { pattern: /\bIA\b/g, spoken: "I A" },
];

function applyPronunciations(text) {
  return SPEECH_PRONUNCIATIONS.reduce(
    (result, { pattern, spoken }) => result.replace(pattern, spoken),
    text
  );
}

function cleanTextForSpeech(text) {
  return applyPronunciations(String(text || ""))
    .replace(/```[\s\S]*?```/g, " bloc de code omis ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " lien ")
    .replace(/[*#_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSafeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function getProviderLabel(provider, isGriot) {
  if (isGriot) return "Fa-Baaro 👴";
  if (typeof provider !== "string" || !provider.trim()) return "IA Active";
  const key = provider.trim().toLowerCase();
  return PROVIDER_LABELS[key] || provider.trim();
}

function makeWelcome(name, isGriot) {
  if (isGriot) {
    return {
      id: "welcome",
      role: "assistant",
      text: `I ko, mon enfant ${name || "de BAARO"}... 👋\nQuand la tortue est sur le muret, c'est qu'on l'a posée là. Tu es venu me voir, c'est que ton cœur a une question.\nJe suis Fa-Baaro, le Griot. Assieds-toi, parle-moi.`,
    };
  }
  return {
    id: "welcome",
    role: "assistant",
    text: `Salut ${name || "membre"} ! 👋\nJe suis l'Assistant IA de BAARO. Que souhaites-tu créer ou analyser aujourd'hui ?`,
  };
}

function loadStoredMessages(key, name, isGriot) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [makeWelcome(name)];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [makeWelcome(name)];
    }
    const valid = parsed.filter(
      (m) =>
        m &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        !m.isError
    );
    if (valid.length === 0) return [makeWelcome(name)];
    return valid[0].id === "welcome" ? valid : [makeWelcome(name), ...valid];
  } catch {
    return [makeWelcome(name)];
  }
}

function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/* ---------- Rendu texte léger (gras, listes, titres) ---------- */

function renderInline(line, prefix) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${prefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

function RichText({ text }) {
  const lines = String(text || "").split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;

        const heading = line.match(/^#{1,3}\s+(.*)/);
        if (heading) {
          return (
            <p key={i} className="font-bold">
              {renderInline(heading[1], i)}
            </p>
          );
        }

        const bullet = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
        if (bullet) {
          return (
            <p key={i} className="pl-3 relative">
              <span className="absolute left-0">•</span>
              {renderInline(bullet[1], i)}
            </p>
          );
        }

        return <p key={i}>{renderInline(line, i)}</p>;
      })}
    </div>
  );
}

/* ---------- Composant principal ---------- */

export function AiAssistantTab({
  userProfile,
  onPublishAction,
  onGenerateMedia,
  prefill,
}) {
  const { showToast, showPointsReward } = useToast();

  const displayName = userProfile?.display_name;
  const storageKey = useMemo(
    () =>
      `${STORAGE_PREFIX}${userProfile?.id || userProfile?.user_id || "anon"}`,
    [userProfile?.id, userProfile?.user_id]
  );

  const [messages, setMessages] = useState(() =>
    loadStoredMessages(storageKey, displayName)
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem(SPEAK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const speakingIdRef = useRef(null);
  const mountedRef = useRef(false);

  /* ----- Voix ----- */

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Synthèse indisponible.
      }
    }
    speakingIdRef.current = null;
    if (mountedRef.current) setSpeakingMessageId(null);
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
          // Déjà arrêtée.
        }
      }
    }
    if (mountedRef.current) setIsListening(false);
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

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
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
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [stopSpeech, stopListening]);

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
            (v) => (v.lang || "").toLowerCase().replace(/_/g, "-") === "fr-fr"
          ) ||
          voices.find((v) => (v.lang || "").toLowerCase().startsWith("fr"));
        if (frenchVoice) utterance.voice = frenchVoice;
      } catch {
        // Voix par défaut.
      }

      const done = () => {
        if (speakingIdRef.current === messageId) {
          speakingIdRef.current = null;
          if (mountedRef.current) setSpeakingMessageId(null);
        }
      };
      utterance.onend = done;
      utterance.onerror = done;

      speakingIdRef.current = messageId;
      setSpeakingMessageId(messageId);

      try {
        synth.speak(utterance);
      } catch {
        speakingIdRef.current = null;
        setSpeakingMessageId(null);
        if (force) {
          showToast("Impossible de lire cette réponse à voix haute", "error");
        }
      }
    },
    [showToast, stopSpeech]
  );

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
      } catch {
        // Ignoré.
      }
      if (!next) stopSpeech();
      return next;
    });
  }, [stopSpeech]);

  const toggleListening = useCallback(() => {
    if (typeof window === "undefined") {
      showToast("La dictée vocale n'est pas disponible", "error");
      return;
    }

    if (recognitionRef.current) {
      stopListening();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

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
        if (mountedRef.current) setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (!transcript || !mountedRef.current) return;
        setInput((previous) =>
          (previous ? `${previous} ${transcript}` : transcript).slice(
            0,
            MAX_INPUT_LENGTH
          )
        );
      };

      recognition.onerror = () => {
        if (mountedRef.current) setIsListening(false);
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (mountedRef.current) setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      showToast("Impossible d'activer le micro", "error");
    }
  }, [showToast, stopListening]);

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
    setMessages([makeWelcome(displayName)]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignoré.
    }
  }, [stopGeneration, stopSpeech, stopListening, displayName, storageKey]);

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
            context: {
              display_name: displayName,
              language: "fr",
              app: "BAARO",
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

        if (autoSpeak) speakText(assistantMsgId, replyText);

        if (typeof showPointsReward === "function") {
          showPointsReward(2, "Échange avec l'IA");
        }
      } catch (error) {
        if (!timedOut && (error?.name === "AbortError" || controller.signal.aborted)) {
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
      autoSpeak,
      showPointsReward,
      speakText,
      stopSpeech,
      stopListening,
    ]
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
          <Bot size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-sm text-white truncate">
            Assistant IA BAARO
          </h2>
          <p className="text-xs text-white/50 truncate">Multi-IA intelligent</p>
        </div>

        <span
          className="text-[10px] font-mono px-2 py-1 rounded-full border whitespace-nowrap shrink-0"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}
        >
          {getProviderLabel(provider)}
        </span>

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

      {/* Suggestions */}
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
          {messages.map((message) => {
            const isSpeaking = speakingMessageId === message.id;
            const isAssistant = message.role === "assistant";
            const showActions =
              isAssistant && !message.isError && message.id !== "welcome";

            return (
              <div
                key={message.id}
                className={`flex gap-2.5 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
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
                  {isAssistant ? <Bot size={15} /> : <User size={15} />}
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
                      onClick={() =>
                        handleSend(message.retryText, { retry: true })
                      }
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

                  {showActions && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          speakText(message.id, message.text, { force: true })
                        }
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                        style={{
                          background: isSpeaking
                            ? `${COLORS.teal}20`
                            : COLORS.surface2,
                          borderColor: isSpeaking
                            ? COLORS.borderTeal
                            : COLORS.border,
                          color: isSpeaking ? COLORS.teal : COLORS.muted,
                        }}
                        aria-label={
                          isSpeaking ? "Arrêter la lecture" : "Écouter la réponse"
                        }
                        aria-pressed={isSpeaking}
                      >
                        {isSpeaking ? (
                          <VolumeX size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                        <span>{isSpeaking ? "Arrêter" : "Écouter"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copyMessage(message.text)}
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

                      {message.canGenerate &&
                        typeof onGenerateMedia === "function" && (
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

                      {message.canPublish &&
                        typeof onPublishAction === "function" && (
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
            placeholder={isListening ? "Écoute en cours..." : "Écris ton message…"}
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
