import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
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
import { useSettings } from "../../hooks/useSettings.js";

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
  { icon: ImageIcon, text: "Griot, résume ce post en points clés" },
  { icon: Zap, text: "Griot, cherche les informations à jour sur ce sujet" },
];

// Voix féminines : le moteur natif choisit une voix française féminine
// disponible sur l'appareil ; le serveur adapte aussi le style de réponse.
const GRIOT_VOICE_PROFILES = {
  fatou: { label: "Fatou", hint: "douce et rassurante", gender: "female" },
  aminata: { label: "Aminata", hint: "posée et structurée", gender: "female" },
  mariam: { label: "Mariam", hint: "conteuse et chaleureuse", gender: "female" },
  awa: { label: "Awa", hint: "énergique et directe", gender: "female" },
  moussa: { label: "Moussa", hint: "calme et profond", gender: "male" },
  bakary: { label: "Bakary", hint: "précis et protecteur", gender: "male" },
  oumar: { label: "Oumar", hint: "vivant et encourageant", gender: "male" },
};
const GRIOT_VOICE_LABELS = Object.fromEntries(
  Object.entries(GRIOT_VOICE_PROFILES).map(([key, profile]) => [
    key,
    `${profile.label} · ${profile.hint}`,
  ])
);

const GRIOT_VOICE_ALIASES = {
  normal: "fatou",
  conseil: "fatou",
  palabre: "aminata",
  histoire: "mariam",
};
const GRIOT_FOLLOWUPS = [
  { label: "Approfondir", prompt: "Griotte, approfondis ta réponse avec des exemples concrets." },
  { label: "Résumé court", prompt: "Griotte, fais-moi un résumé en 3 points." },
  { label: "Options", prompt: "Griotte, donne-moi 3 options avec avantages et limites." },
  { label: "Vérifier en ligne", prompt: "Griotte, vérifie les informations récentes sur ce sujet sur le web." },
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

const HISTORY_LIMIT = 12;
const STORED_LIMIT = 50;
const MAX_INPUT_LENGTH = 4000;
const REQUEST_TIMEOUT_MS = 45000;
const STORAGE_PREFIX = "baaro_ai_chat_v1_";
const SPEAK_KEY = "baaro_ai_autospeak";
const GRIOT_KEY = "baaro_griot_mode";
const GRIOT_VOICE_KEY = "baaro_griot_voice";

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

function resolveAssistantName(profile) {
  const candidates = [
    profile?.display_name,
    profile?.first_name,
    profile?.handle,
  ];
  const value = candidates
    .map((item) => String(item || "").trim())
    .find((item) => item && !/^membre baaro$/i.test(item));
  return value?.replace(/^@/, "") || "ami";
}

async function findNativeVoice(voiceKey) {
  try {
    const { voices = [] } = await TextToSpeech.getSupportedVoices();
    const french = voices
      .map((voice, index) => ({ voice, index }))
      .filter(({ voice }) => /^fr(?:-|_|$)/i.test(String(voice?.lang || "")));
    if (!french.length) return undefined;
    const profileName = GRIOT_VOICE_PROFILES[voiceKey]?.label?.toLowerCase() || "";
    const profile = GRIOT_VOICE_PROFILES[voiceKey];
    const femaleWords = /female|femme|woman|女性|fran[cç]aise|google fran[cç]ais|amelie|audrey|marie|julie|sophie|claire|fatou|aminata|mariam|awa/i;
    const maleWords = /male|homme|man|masculin|homme fran[cç]ais|thomas|paul|pierre|jacques|moussa|bakary|oumar/i;
    const ranked = [...french].sort((a, b) => {
      const score = ({ voice }) => {
        const name = String(voice?.name || "").toLowerCase();
        const genderMatch = profile?.gender === "male" ? maleWords.test(name) : femaleWords.test(name);
        return (name.includes(profileName) ? 4 : 0) + (genderMatch ? 3 : 0) + (voice?.localService ? 1 : 0);
      };
      return score(b) - score(a);
    });
    return ranked[0]?.index;
  } catch {
    return undefined;
  }
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
  if (isGriot) return "Fa-Baaro · Griotte";
  if (typeof provider !== "string" || !provider.trim()) return "IA Active";
  const key = provider.trim().toLowerCase();
  return PROVIDER_LABELS[key] || provider.trim();
}

function makeWelcome(name, isGriot) {
  if (isGriot) {
    return {
      id: "welcome",
      role: "assistant",
      text: `I ko, mon enfant ${name || "de BAARO"}... 👋\nQuand la tortue est sur le muret, c'est qu'on l'a posée là. Tu es venue me voir, c'est que ton cœur a une question.\nJe suis Fa-Baaro, la Griotte de BAARO. Assieds-toi, parle-moi.`,
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
    if (!raw) return [makeWelcome(name, isGriot)];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [makeWelcome(name, isGriot)];
    }
    const valid = parsed.filter(
      (m) =>
        m &&
        typeof m.id === "string" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        !m.isError
    );
    if (valid.length === 0) return [makeWelcome(name, isGriot)];
    return valid[0].id === "welcome"
      ? [makeWelcome(name, isGriot), ...valid.slice(1)]
      : [makeWelcome(name, isGriot), ...valid];
  } catch {
    return [makeWelcome(name, isGriot)];
  }
}

function readGriotMode() {
  try {
    return localStorage.getItem(GRIOT_KEY) === "1";
  } catch {
    return false;
  }
}

function readGriotVoice() {
  try {
    const stored = localStorage.getItem(GRIOT_VOICE_KEY);
    if (stored && GRIOT_VOICE_PROFILES[stored]) return stored;
    return GRIOT_VOICE_ALIASES[stored] || "fatou";
  } catch {
    return "fatou";
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
  const { settings } = useSettings();

  const displayName = useMemo(
    () => resolveAssistantName(userProfile),
    [userProfile]
  );
  const nativeApp = Capacitor.isNativePlatform();

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

  const presets = settings.ai_suggest
    ? isGriot
      ? PRESETS_GRIOT
      : PRESETS_NORMAL
    : [];

  /* ----- Voix ----- */

  const stopSpeech = useCallback(() => {
    if (nativeApp) {
      TextToSpeech.stop().catch(() => {});
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Synthèse indisponible.
      }
    }
    speakingIdRef.current = null;
    if (mountedRef.current) setSpeakingMessageId(null);
  }, [nativeApp]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition?.native) {
      SpeechRecognition.stop().catch(() => {});
      SpeechRecognition.removeAllListeners().catch(() => {});
    } else if (recognition) {
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
      if (recognition?.native) {
        SpeechRecognition.stop().catch(() => {});
        SpeechRecognition.removeAllListeners().catch(() => {});
      } else if (recognition) {
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
      if (nativeApp) TextToSpeech.stop().catch(() => {});
      speakingIdRef.current = null;
    };
  }, [nativeApp]);

  useEffect(() => {
    if (!displayName || displayName === "ami") return;
    setMessages((previous) => {
      if (previous.length !== 1 || previous[0]?.id !== "welcome") return previous;
      return [makeWelcome(displayName, isGriot)];
    });
  }, [displayName, isGriot]);

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
    async (messageId, text, { force = false } = {}) => {
      if (speakingIdRef.current === messageId) {
        stopSpeech();
        return;
      }

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;
      stopSpeech();
      speakingIdRef.current = messageId;
      setSpeakingMessageId(messageId);

      const done = () => {
        if (speakingIdRef.current === messageId) {
          speakingIdRef.current = null;
          if (mountedRef.current) setSpeakingMessageId(null);
        }
      };

      try {
        if (nativeApp) {
          const voice = await findNativeVoice(griotVoice);
          await TextToSpeech.speak({
            text: cleaned,
            lang: "fr-FR",
            rate: isGriot ? 0.92 : 1,
            pitch: isGriot ? 0.85 : 1,
            volume: 1,
            category: "playback",
            queueStrategy: 0,
            ...(voice === undefined ? {} : { voice }),
          });
          done();
          return;
        }

        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window) ||
          typeof window.SpeechSynthesisUtterance !== "function"
        ) {
          throw new Error("La synthèse vocale n'est pas disponible sur cet appareil");
        }

        const synth = window.speechSynthesis;
        const utterance = new window.SpeechSynthesisUtterance(cleaned);
        utterance.lang = "fr-FR";
        utterance.rate = isGriot ? 0.92 : 1;
        utterance.pitch = isGriot ? 0.85 : 1;
        const voices = synth.getVoices() || [];
        const frenchVoice =
          voices.find((v) => (v.lang || "").toLowerCase().replace(/_/g, "-") === "fr-fr") ||
          voices.find((v) => (v.lang || "").toLowerCase().startsWith("fr"));
        if (frenchVoice) utterance.voice = frenchVoice;
        utterance.onend = done;
        utterance.onerror = done;
        synth.speak(utterance);
      } catch (error) {
        done();
        if (force) {
          showToast(error?.message || "Impossible de lire cette réponse à voix haute", "error");
        }
      }
    },
    [showToast, stopSpeech, isGriot, nativeApp]
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

  const toggleListening = useCallback(async () => {
    if (recognitionRef.current) {
      stopListening();
      return;
    }

    if (nativeApp) {
      try {
        const { available } = await SpeechRecognition.available();
        if (!available) throw new Error("La reconnaissance vocale est indisponible sur cet appareil");

        let permission = await SpeechRecognition.checkPermissions();
        if (permission.speechRecognition !== "granted") {
          permission = await SpeechRecognition.requestPermissions();
        }
        if (permission.speechRecognition !== "granted") {
          throw new Error("L'autorisation du microphone est refusée");
        }

        await SpeechRecognition.removeAllListeners();
        recognitionRef.current = { native: true };
        await SpeechRecognition.addListener("partialResults", (data) => {
          const transcript = data?.matches?.[0] || data?.value?.[0];
          if (!transcript || !mountedRef.current) return;
          setInput((previous) =>
            (previous ? `${previous} ${transcript}` : transcript).slice(0, MAX_INPUT_LENGTH)
          );
        });
        await SpeechRecognition.addListener("listeningState", (data) => {
          if (data?.status === "started" && mountedRef.current) setIsListening(true);
          if (data?.status === "stopped") {
            recognitionRef.current = null;
            if (mountedRef.current) setIsListening(false);
          }
        });
        setIsListening(true);
        await SpeechRecognition.start({
          language: "fr-FR",
          maxResults: 1,
          partialResults: true,
          popup: false,
        });
      } catch (error) {
        recognitionRef.current = null;
        setIsListening(false);
        showToast(error?.message || "Impossible d'activer le micro", "error");
      }
      return;
    }

    if (typeof window === "undefined") {
      showToast("La dictée vocale n'est pas disponible", "error");
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
  }, [showToast, stopListening, nativeApp]);

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

        const imageUrl = getSafeImageUrl(data.imageUrl);
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
                        <p className="text-[10px] font-semibold text-white/50">Sources vérifiées maintenant</p>
                        {message.sources.slice(0, 5).map((source, index) => (
                          <a
                            key={`${source.url}-${index}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[11px] underline underline-offset-2 truncate"
                            style={{ color: COLORS.teal }}
                          >
                            [{index + 1}] {source.title || source.url}
                          </a>
                        ))}
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

                  {showActions && isGriot && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {GRIOT_FOLLOWUPS.map((followup) => (
                        <button
                          key={followup.label}
                          type="button"
                          onClick={() => handleSend(followup.prompt)}
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
