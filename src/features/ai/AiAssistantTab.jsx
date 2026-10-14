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
};

export function AiAssistantTab({ userProfile, onPublishAction }) {
  const { showToast, showPointsReward } = useToast();
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: `Salut ${userProfile?.display_name || "membre"} ! 👋\nJe suis l'Assistant IA de BAARO. Que souhaites-tu créer ou analyser aujourd'hui ?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(null);
  
  // États vocaux
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopSpeech();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopSpeech();
    };
  }, [stopSpeech]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fonction de lecture vocale (utilisée pour le clic manuel ET l'auto-lecture)
  const speakText = useCallback((messageId, text) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;

    if (speakingMessageId === messageId) {
      synth.cancel();
      setSpeakingMessageId(null);
      return;
    }

    synth.cancel();
    if (!text) return;

    const cleanText = text.replace(/[*#_`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    const voices = synth.getVoices();
    const frenchVoice = voices.find((v) => v.lang.startsWith("fr") || v.lang.startsWith("FR"));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    utterance.lang = "fr-FR";
    utterance.rate = 1.0;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(messageId);
    synth.speak(utterance);
  }, [speakingMessageId]);

  // Gestion de la reconnaissance vocale (Micro)
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("La dictée vocale n'est pas supportée par votre navigateur", "error");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      showToast("Impossible d'activer le micro", "error");
    }
  };

  const handleSend = async (customText) => {
    const query = (customText || input).trim();
    if (!query || loading) return;
    setInput("");
    stopSpeech();

    const userMsg = { id: `u_${Date.now()}`, role: "user", text: query };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: query }],
          context: { display_name: userProfile?.display_name },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "IA temporairement indisponible");

      if (data.provider) setProvider(data.provider);
      const replyText = data.reply || "Voici une suggestion personnalisée.";

      const assistantMsgId = `a_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", text: replyText, canPublish: true },
      ]);

      // --- LECTURE AUTOMATIQUE DE LA RÉPONSE DE L'IA ---
      setTimeout(() => {
        speakText(assistantMsgId, replyText);
      }, 250);

      if (showPointsReward) showPointsReward(2, "Échange avec l'IA");
    } catch (e) {
      const errorMsgId = `err_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: errorMsgId, role: "assistant", text: e.message, isError: true },
      ]);
      speakText(errorMsgId, e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-24">
      <div
        className="rounded-2xl p-4 border flex items-center justify-between"
        style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style={{ background: COLORS.gold, color: "#000" }}>
            <Bot size={20} />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">Assistant IA BAARO</h2>
            <p className="text-xs text-white/50">Moteur Unifié Multi-Providers</p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded-full border" style={{ borderColor: COLORS.borderTeal, color: COLORS.teal }}>
          {provider ? PROVIDER_LABELS[provider] || provider : "IA Active"}
        </span>
      </div>

      {/* Presets */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p.text)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap shrink-0 hover:bg-white/5"
            style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <p.icon size={13} style={{ color: COLORS.gold }} />
            {p.text}
          </button>
        ))}
      </div>

      {/* Zone Messages */}
      <div className="rounded-2xl border p-4 flex flex-col min-h-[380px]" style={{ background: COLORS.surface, borderColor: COLORS.border }}>
        <div className="flex-1 overflow-y-auto space-y-4 max-h-[360px] pr-1">
          {messages.map((m) => {
            const isSpeaking = speakingMessageId === m.id;

            return (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: m.role === "assistant" ? COLORS.gold : COLORS.teal, color: "#000" }}>
                  {m.role === "assistant" ? <Bot size={15} /> : <User size={15} />}
                </div>
                <div className="max-w-[80%] flex flex-col gap-1.5">
                  <div className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line border" style={{ background: COLORS.surface2, color: COLORS.ivory, borderColor: COLORS.border }}>
                    {m.text}
                  </div>

                  {m.role === "assistant" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => speakText(m.id, m.text)}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-all active:scale-95"
                        style={{
                          background: isSpeaking ? `${COLORS.teal}20` : COLORS.surface2,
                          borderColor: isSpeaking ? COLORS.borderTeal : COLORS.border,
                          color: isSpeaking ? COLORS.teal : COLORS.muted,
                        }}
                      >
                        {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        <span>{isSpeaking ? "Arrêter" : "Écouter"}</span>
                      </button>

                      {m.canPublish && typeof onPublishAction === "function" && (
                        <button
                          onClick={() => onPublishAction(m.text)}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border"
                          style={{ background: `${COLORS.teal}20`, borderColor: COLORS.borderTeal, color: COLORS.teal }}
                        >
                          <PlusCircle size={13} /> Publier cette idée
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.gold }}>
              <Sparkles size={14} className="animate-spin" />
              L'Assistant BAARO réfléchit...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2 pt-4 border-t mt-3" style={{ borderColor: COLORS.border }}>
          <button
            type="button"
            onClick={toggleListening}
            className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${isListening ? "animate-pulse" : ""}`}
            style={{
              background: isListening ? `${COLORS.teal}20` : COLORS.surface2,
              borderColor: isListening ? COLORS.borderTeal : COLORS.border,
              color: isListening ? COLORS.teal : COLORS.ivory,
            }}
            title="Dicter par la voix"
          >
            {isListening ? <Square size={16} /> : <Mic size={16} />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Écoute en cours..." : "Posez votre question ou demandez une action..."}
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ background: COLORS.surface2, borderColor: COLORS.border, color: COLORS.ivory }}
          />
          <button type="submit" disabled={!input.trim() || loading} className="px-4 py-2.5 rounded-xl font-bold disabled:opacity-40" style={{ background: COLORS.gold, color: "#000" }}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default AiAssistantTab;
