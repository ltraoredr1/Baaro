import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Send, X } from "lucide-react";
import { COLORS } from "../../theme.js";
import { API_BASE } from "../../config.js";
import { supabase } from "../../supabaseClient.js";
import { answerLocally, parseGuideReply, tabLabel, ui } from "./guideContent.js";

/**
 * Guide IA : l'utilisateur pose une question, l'IA explique le fonctionnement
 * de BAARO et peut proposer des boutons « Aller à… » qui ouvrent l'écran cité.
 *
 * Si l'IA est indisponible (hors-ligne, quota, erreur), le guide intégré
 * (answerLocally) répond à sa place : l'aide ne tombe jamais en panne.
 */

const HISTORY_LIMIT = 8;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_INPUT = 500;

// Rendu minimal : **gras** et listes "- " (les réponses IA restent simples).
function renderInline(line, key) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ color: COLORS.ivory }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

function MessageText({ text }) {
  const lines = String(text || "").split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^\s*[-•]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span style={{ color: COLORS.gold }}>•</span>
              {renderInline(line.replace(/^\s*[-•]\s+/, ""), i)}
            </div>
          );
        }
        return <div key={i}>{renderInline(line, i)}</div>;
      })}
    </div>
  );
}

export default function GuideAiChat({
  lang,
  activeTab,
  displayName,
  initialQuestion,
  onNavigate,
  onClose,
  onChangeMode,
}) {
  const t = ui(lang);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const lastInitialRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const addAssistant = useCallback((payload) => {
    setMessages((prev) => [...prev, { id: `a_${Date.now()}_${prev.length}`, role: "assistant", ...payload }]);
  }, []);

  const ask = useCallback(
    async (rawQuestion) => {
      const question = String(rawQuestion || "").trim().slice(0, MAX_INPUT);
      if (!question || loading) return;

      const userMsg = { id: `u_${Date.now()}`, role: "user", text: question };
      const history = [...messages, userMsg]
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.text }));
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          throw new Error("offline");
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("no-session");

        const response = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: history,
            mode: "guide",
            max_tokens: 500,
            context: {
              display_name: displayName,
              language: lang,
              current_tab: activeTab,
            },
          }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.reply !== "string" || !data.reply.trim()) {
          throw new Error(data?.error || `http-${response.status}`);
        }
        if (!mountedRef.current) return;
        const { text, tabs } = parseGuideReply(data.reply);
        addAssistant({ text: text || data.reply.trim(), tabs });
      } catch {
        if (!mountedRef.current) return;
        // Repli : le guide intégré répond sans IA.
        const local = answerLocally(question, activeTab, lang);
        addAssistant({ text: `${t.fallbackNote}\n\n${local.text}`, tabs: local.tabs });
      } finally {
        clearTimeout(timeoutId);
        if (mountedRef.current) setLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [messages, loading, displayName, lang, activeTab, addAssistant, t.fallbackNote]
  );

  // Question pré-remplie (ex. « Demander à l'IA » depuis la visite guidée).
  useEffect(() => {
    if (!initialQuestion?.text || lastInitialRef.current === initialQuestion.key) return;
    lastInitialRef.current = initialQuestion.key;
    ask(initialQuestion.text);
  }, [initialQuestion, ask]);

  const suggestions = [
    { label: t.explainScreen, q: t.explainScreen },
    { label: t.whereStart, q: t.whereStart },
    { label: t.howEarn, q: t.howEarn },
    { label: t.offlineQ, q: t.offlineQ },
  ];

  return (
    <div
      role="dialog"
      aria-label={t.aiTitle}
      className="fixed z-[1100] inset-x-2 bottom-[88px] top-16 md:inset-x-auto md:right-6 md:bottom-6 md:top-auto md:w-[400px] md:h-[600px] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
      style={{ background: COLORS.bg, borderColor: COLORS.borderGold }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: COLORS.goldGlow, color: COLORS.gold }}
        >
          <Bot size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
            {t.aiTitle}
          </p>
          <button
            type="button"
            onClick={onChangeMode}
            className="text-[11px] underline underline-offset-2 hover:opacity-80"
            style={{ color: COLORS.muted }}
          >
            {t.switchToTour}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 transition"
          style={{ color: COLORS.muted }}
          aria-label={t.close}
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div
          className="max-w-[90%] rounded-2xl rounded-tl-md px-3 py-2 text-sm leading-relaxed"
          style={{ background: COLORS.surface2, color: COLORS.mutedLight }}
        >
          {t.aiHello}
        </div>

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[90%] px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-tl-md"
              }`}
              style={
                m.role === "user"
                  ? { background: COLORS.gold, color: COLORS.bg }
                  : { background: COLORS.surface2, color: COLORS.mutedLight }
              }
            >
              {m.role === "user" ? m.text : <MessageText text={m.text} />}
              {m.tabs?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {m.tabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => onNavigate?.(tab)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition hover:opacity-90"
                      style={{ background: COLORS.gold, color: COLORS.bg }}
                    >
                      {t.goTo} {tabLabel(tab, lang)}
                      <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-xs" style={{ color: COLORS.muted }} aria-live="polite">
            {t.thinking}
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => ask(s.q)}
              className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition hover:bg-white/5"
              style={{ borderColor: COLORS.borderGold, color: COLORS.gold }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 p-3 border-t"
        style={{ borderColor: COLORS.border, background: COLORS.surface }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
          placeholder={t.placeholder}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none border"
          style={{
            background: COLORS.bg,
            borderColor: COLORS.border,
            color: COLORS.ivory,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 rounded-xl disabled:opacity-40 transition"
          style={{ background: COLORS.gold, color: COLORS.bg }}
          aria-label={t.send}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
