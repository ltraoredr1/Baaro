/**
 * Fichier : src/features/ai/AiAssistantTab.jsx
 *
 * Améliorations par rapport à la version précédente :
 *  - Mode vocal intégré (micro -> IA -> réponse lue à voix haute -> micro rouvert)
 *    La conversation vocale apparaît dans le même fil que les messages écrits.
 *  - Bouton « Écouter » sur chaque réponse de l'assistant.
 *  - Erreurs claires (session expirée, trop de messages, IA indisponible…)
 *    au lieu d'un message « Désolé » identique pour tout.
 *  - L'historique envoyé à l'IA ne contient plus le message de bienvenue ni les
 *    messages d'erreur, et commence toujours par un message utilisateur
 *    (certains fournisseurs refusent un historique qui commence par l'assistant).
 *  - Le badge n'affiche plus « Claude Sonnet » en dur : il montre le fournisseur réel.
 *  - Les « +2 points » ne s'affichent plus quand l'IA a échoué.
 *  - **gras** rendu correctement dans les réponses.
 */
import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { COLORS } from "../../theme.js";
import { useToast } from "../../components/ToastContext.jsx";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";

const PRESETS = [
  { icon: Coins, text: "Comment maximiser mes points aujourd'hui ?" },
  { icon: Swords, text: "Propose-moi 3 sujets de débat viraux" },
  { icon: MessageSquare, text: "Idée de publication engageante" },
  { icon: Zap, text: "Analyse mon activité BAARO et donne des conseils" },
];

const PROVIDER_LABELS = {
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  anthropic: "Claude",
  openai: "OpenAI",
  moonshot: "Kimi",
  xai: "Grok",
  n8n: "Agent BAARO",
};

const VOICE_SYSTEM =
  "Tu es l'assistant vocal de BAARO. Réponds en 1 à 3 phrases courtes, naturelles à l'oral, sans liste, sans markdown et sans émojis.";

const SPEECH_LANGS = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  pt: "pt-PT",
  de: "de-DE",
  ar: "ar-SA",
};

const MAX_SILENT_RETRIES = 3;

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

// Retire ce qui se lit mal à voix haute (markdown, liens, émojis)
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>~]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function friendlyError(status) {
  if (status === 401) return "Ta session a expiré. Reconnecte-toi, puis réessaie.";
  if (status === 403) return "Accès refusé. Recharge la page, puis réessaie.";
  if (status === 429) return "Tu envoies trop de messages. Attends une minute, puis réessaie.";
  if (status >= 500) return "L’IA est temporairement indisponible. Réessaie dans un instant.";
  return "Je n’ai pas pu répondre. Vérifie ta connexion et réessaie.";
}

// Affiche **gras** sans dépendance supplémentaire
function RichText({ text }) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

const VOICE_LABELS = {
  idle: "Appuie sur le cercle pour parler",
  listening: "Je t’écoute… appuie pour mettre en pause",
  thinking: "Je réfléchis…",
  speaking: "Je réponds… appuie pour m’interrompre",
};

export function AiAssistantTab({ userId, userProfile, onRewardPoints }) {
  const { showToast, showPointsReward } = useToast();

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: `Salut ${userProfile?.display_name || "toi"} ! 👋
Je suis ton assistant BAARO. Je peux t’aider à créer, découvrir, publier et mieux utiliser BAARO.
Que veux-tu faire ?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  // Mode vocal
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [voiceError, setVoiceError] = useState("");

  const bottomRef = useRef(null);
  const messagesRef = useRef(messages);
  const voiceActiveRef = useRef(false);
  const listeningRef = useRef(false);
  const recRef = useRef(null);
  const abortRef = useRef(null);
  const silentRef = useRef(0);
  const speakTokenRef = useRef(0);

  const code = String(userProfile?.language || "fr").slice(0, 2).toLowerCase();
  const speechLang = SPEECH_LANGS[code] || "fr-FR";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Nettoyage si l'onglet est quitté
  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      speakTokenRef.current += 1;
      try {
        recRef.current?.abort();
      } catch {
        /* rien */
      }
      abortRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const buildContext = () => ({
    display_name: userProfile?.display_name,
    handle: userProfile?.handle,
    bio: userProfile?.bio,
    language: userProfile?.language,
  });

  // Ajoute un message en gardant la référence à jour (utile pour le mode vocal)
  const addMessage = (msg) => {
    const next = [...messagesRef.current, msg];
    messagesRef.current = next;
    setMessages(next);
  };

  // ---------- Appel à l'IA (texte ou voix) ----------
  async function askAi(query, { voice = false } = {}) {
    addMessage({ id: `u_${Date.now()}`, role: "user", text: query });
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messagesRef.current
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            m.id !== "welcome" &&
            !m.isError
        )
        .slice(-9)
        .map((m) => ({ role: m.role, content: m.text }));

      // L'historique doit commencer par un message utilisateur
      while (history.length && history[0].role !== "user") history.shift();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw Object.assign(new Error("Session BAARO absente"), { status: 401 });
      }

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: history,
          context: buildContext(),
          max_tokens: voice ? 300 : 1000,
          ...(voice ? { system: VOICE_SYSTEM } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(data.error || "Erreur serveur"), {
          status: res.status,
        });
      }

      const reply = data.reply || data.content?.[0]?.text;
      if (!reply) {
        throw Object.assign(new Error("Réponse vide"), { status: 0 });
      }

      if (data.provider) setProvider(data.provider);
      addMessage({ id: `a_${Date.now()}`, role: "assistant", text: reply });

      if (typeof showPointsReward === "function") {
        showPointsReward(2, "Échange avec l’IA");
      }
      return reply;
    } catch (e) {
      if (e.name === "AbortError") return null;
      console.error("Erreur IA:", e);
      addMessage({
        id: `err_${Date.now()}`,
        role: "assistant",
        text: friendlyError(e.status),
        isError: true,
      });
      return null;
    } finally {
      setLoading(false);
    }
  }

  const handleSend = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;
    setInput("");
    await askAi(query);
  };

  // ---------- Lecture à voix haute ----------
  function speakText(text, onDone) {
    const clean = cleanForSpeech(text);
    if (!clean || typeof window === "undefined" || !("speechSynthesis" in window)) {
      onDone?.();
      return;
    }

    const token = ++speakTokenRef.current; // invalide les lectures précédentes
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = speechLang;
    utterance.rate = 1;

    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang && v.lang.toLowerCase().startsWith(speechLang.slice(0, 2)));
    if (voice) utterance.voice = voice;

    const done = () => {
      if (token !== speakTokenRef.current) return; // lecture remplacée ou annulée
      onDone?.();
    };
    utterance.onend = done;
    utterance.onerror = done;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    speakTokenRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  const toggleSpeakMessage = (m) => {
    if (speakingId === m.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(m.id);
    speakText(m.text, () => setSpeakingId(null));
  };

  // ---------- Mode vocal ----------
  function listen() {
    if (!SpeechRecognition || !voiceActiveRef.current || listeningRef.current) return;

    const rec = new SpeechRecognition();
    rec.lang = speechLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    let finalText = "";

    rec.onstart = () => {
      listeningRef.current = true;
      setVoiceStatus("listening");
      setVoiceError("");
    };

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setHeard(finalText || interim);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        voiceActiveRef.current = false;
        setVoiceStatus("idle");
        setVoiceError("Le micro est bloqué. Autorise-le dans les réglages du site, puis réessaie.");
      } else if (e.error === "network") {
        voiceActiveRef.current = false;
        setVoiceStatus("idle");
        setVoiceError("La reconnaissance vocale a besoin d’Internet. Vérifie ta connexion, puis réessaie.");
      }
      // "no-speech" et "aborted" sont gérés dans onend
    };

    rec.onend = () => {
      listeningRef.current = false;
      if (!voiceActiveRef.current) return;

      const text = finalText.trim();
      if (text) {
        silentRef.current = 0;
        handleVoiceTurn(text);
      } else if (silentRef.current < MAX_SILENT_RETRIES) {
        silentRef.current += 1;
        listen();
      } else {
        voiceActiveRef.current = false;
        setVoiceStatus("idle");
        setVoiceError("Je ne t’entends pas. Rapproche-toi du micro, puis appuie pour reparler.");
      }
    };

    try {
      rec.start();
    } catch {
      listeningRef.current = false;
    }
  }

  async function handleVoiceTurn(text) {
    setVoiceStatus("thinking");
    setHeard(text);

    const reply = await askAi(text, { voice: true });
    if (!voiceActiveRef.current) return; // l'utilisateur a arrêté entre-temps

    if (!reply) {
      voiceActiveRef.current = false;
      setVoiceStatus("idle");
      setVoiceError("L’assistant n’a pas répondu. Appuie sur le cercle pour réessayer.");
      return;
    }

    setVoiceStatus("speaking");
    // Le micro ne se rouvre qu'une fois la réponse terminée (sinon il s'entendrait lui-même)
    speakText(reply, () => {
      if (voiceActiveRef.current) listen();
    });
  }

  function startVoice() {
    stopSpeaking();
    setSpeakingId(null);
    setHeard("");
    setVoiceError("");
    setVoiceOn(true);
    voiceActiveRef.current = true;
    silentRef.current = 0;
    listen();
  }

  function pauseVoice() {
    voiceActiveRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      /* rien */
    }
    abortRef.current?.abort();
    stopSpeaking();
    setVoiceStatus("idle");
  }

  function stopVoice() {
    pauseVoice();
    setVoiceOn(false);
    setHeard("");
    setVoiceError("");
  }

  function handleOrb() {
    setVoiceError("");
    if (voiceStatus === "idle") {
      voiceActiveRef.current = true;
      silentRef.current = 0;
      listen();
    } else if (voiceStatus === "speaking") {
      // Interrompt la réponse et repasse à l'écoute
      stopSpeaking();
      voiceActiveRef.current = true;
      listen();
    } else {
      pauseVoice();
    }
  }

  const voiceActive = voiceStatus !== "idle";
  const orbColor = voiceStatus === "listening" ? COLORS.teal : COLORS.gold;
  const OrbIcon =
    voiceStatus === "listening"
      ? Square
      : voiceStatus === "speaking"
      ? Volume2
      : voiceStatus === "thinking"
      ? Sparkles
      : Mic;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-24">
      {/* Header */}
      <div
        className="rounded-2xl p-5 border flex items-center justify-between"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Bot size={22} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: COLORS.ivory }}>
              Assistant IA BAARO
            </h2>
            <p className="text-xs" style={{ color: COLORS.muted }}>
              Contextuel • Conseils personnalisés • Actions concrètes
            </p>
          </div>
        </div>
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full border"
          style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}
        >
          {provider ? PROVIDER_LABELS[provider] || provider : "IA BAARO"}
        </span>
      </div>

      {/* Presets */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p.text)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs whitespace-nowrap shrink-0 transition hover:border-amber-400/60 disabled:opacity-50"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          >
            <p.icon size={13} style={{ color: COLORS.gold }} />
            {p.text}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        className="rounded-2xl border p-4 flex flex-col min-h-[420px]"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
      >
        <div
          className="flex-1 overflow-y-auto space-y-4 pr-1"
          style={{ maxHeight: voiceOn ? "260px" : "380px" }}
          aria-live="polite"
        >
          {messages.map((m) => {
            const isBot = m.role === "assistant";
            return (
              <div key={m.id} className={`flex gap-3 ${isBot ? "" : "flex-row-reverse"}`}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: isBot ? COLORS.gold : COLORS.teal,
                    color: "#000",
                  }}
                >
                  {isBot ? <Bot size={15} /> : <User size={15} />}
                </div>
                <div className="max-w-[80%] flex flex-col gap-1">
                  <div
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line"
                    style={{
                      background: isBot ? COLORS.surface2 : "rgba(45,191,166,0.15)",
                      color: COLORS.ivory,
                      border: `1px solid ${isBot ? COLORS.borderGold : COLORS.borderTeal}`,
                    }}
                  >
                    <RichText text={m.text} />
                  </div>
                  {isBot && !m.isError && m.id !== "welcome" && (
                    <button
                      type="button"
                      onClick={() => toggleSpeakMessage(m)}
                      aria-label={speakingId === m.id ? "Arrêter la lecture" : "Écouter la réponse"}
                      className="self-start flex items-center gap-1 text-xs px-1 py-0.5"
                      style={{ color: speakingId === m.id ? COLORS.gold : COLORS.muted }}
                    >
                      {speakingId === m.id ? <Square size={12} /> : <Volume2 size={12} />}
                      {speakingId === m.id ? "Arrêter" : "Écouter"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.gold }}>
              <Sparkles size={14} className="animate-spin" />
              L’assistant réfléchit…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Zone de saisie OU mode vocal */}
        {voiceOn ? (
          <div
            className="flex flex-col items-center gap-3 pt-4 border-t mt-3"
            style={{ borderColor: COLORS.border }}
          >
            {heard && (
              <p className="text-sm text-center" style={{ color: COLORS.teal }}>
                {heard}
              </p>
            )}
            {voiceError && (
              <p role="alert" className="text-sm text-center max-w-xs" style={{ color: "#F2A5A5" }}>
                {voiceError}
              </p>
            )}

            <button
              type="button"
              onClick={handleOrb}
              aria-label={VOICE_LABELS[voiceStatus]}
              className="relative w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: orbColor,
                color: "#000",
                boxShadow: voiceActive ? `0 0 0 10px ${orbColor}33` : "none",
                transition: "box-shadow 200ms, background 200ms",
              }}
            >
              {voiceActive && (
                <span
                  className="absolute inset-0 rounded-full motion-safe:animate-ping"
                  style={{ background: `${orbColor}44` }}
                />
              )}
              <OrbIcon
                size={28}
                className={`relative ${voiceStatus === "thinking" ? "animate-spin" : ""}`}
              />
            </button>

            <p className="text-sm" style={{ color: COLORS.ivory }}>
              {VOICE_LABELS[voiceStatus]}
            </p>
            <button
              type="button"
              onClick={stopVoice}
              className="text-xs underline"
              style={{ color: COLORS.muted }}
            >
              Revenir au clavier
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 pt-4 border-t mt-3"
            style={{ borderColor: COLORS.border }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pose ta question ou demande une action…"
              className="flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm outline-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            />
            {SpeechRecognition && (
              <button
                type="button"
                onClick={startVoice}
                disabled={loading}
                aria-label="Parler à l’assistant"
                className="px-4 py-3 rounded-xl border disabled:opacity-40"
                style={{
                  background: COLORS.surface2,
                  borderColor: COLORS.borderGold,
                  color: COLORS.gold,
                }}
              >
                <Mic size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Envoyer"
              className="px-5 py-3 rounded-xl font-bold disabled:opacity-40"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
