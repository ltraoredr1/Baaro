import { useState, useRef, useEffect } from "react";
import { Languages, Loader2, ChevronDown, X } from "lucide-react";
import { COLORS } from "../theme.js";
import { TRANSLATE_LANGS, translateText } from "../lib/translateApi.js";
import { useToast } from "./ToastContext.jsx";

/**
 * Bouton + sélecteur de langue pour traduire un texte (post, commentaire…).
 *
 * Props:
 *   text          — texte source
 *   onTranslated  — (translatedText, meta) => void
 *   onClear       — () => void  (revenir à l'original)
 *   isTranslated  — bool
 *   preferredLang — code langue par défaut (ex: "en")
 */
export function TranslateButton({
  text,
  onTranslated,
  onClear,
  isTranslated = false,
  preferredLang = "en",
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState(preferredLang);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const run = async (targetLang) => {
    if (!text?.trim() || loading) return;
    setLoading(true);
    setOpen(false);
    try {
      const data = await translateText(text, targetLang);
      onTranslated?.(data.translated, {
        targetLang: data.targetLang,
        sourceLang: data.sourceLang,
        cached: data.cached,
      });
    } catch (err) {
      showToast(err.message || "Traduction impossible", "error");
    } finally {
      setLoading(false);
    }
  };

  if (isTranslated) {
    return (
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1.5 text-xs transition hover:opacity-80"
        style={{ color: COLORS.teal }}
        title="Afficher l'original"
      >
        <X size={14} />
        Original
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={loading || !text?.trim()}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs transition hover:opacity-80 disabled:opacity-40"
        style={{ color: COLORS.muted }}
        title="Traduire"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" style={{ color: COLORS.gold }} />
        ) : (
          <Languages size={16} />
        )}
        <span className="hidden sm:inline">Traduire</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full mb-2 z-50 w-44 max-h-56 overflow-y-auto rounded-xl border shadow-2xl p-1.5"
          style={{
            background: COLORS.surface2,
            borderColor: COLORS.borderGold,
          }}
        >
          <p
            className="px-2 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: COLORS.muted }}
          >
            Traduire en
          </p>
          {TRANSLATE_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                run(l.code);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition"
              style={{
                background: lang === l.code ? COLORS.goldGlow : "transparent",
                color: lang === l.code ? COLORS.gold : COLORS.ivory,
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
