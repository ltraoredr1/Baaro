import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
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
  quickLangs = [],
}) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const menuRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState(preferredLang);
  const ref = useRef(null);

  // Le menu est affiché hors du conteneur (portail) : la ligne d'actions du
  // post défile horizontalement et coupait le menu, qui restait invisible.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const width = 176;
    const maxH = 224;
    const above = r.top > maxH + 12 || r.top > window.innerHeight - r.bottom;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      top: above ? Math.max(8, r.top - maxH - 8) : r.bottom + 8,
      maxH: Math.min(maxH, above ? r.top - 16 : window.innerHeight - r.bottom - 16),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const hide = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

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
      showToast(err.message || t("video_translate.failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  // Langues rapides d'abord (bm, wo, ...), puis la langue préférée, puis le reste.
  const orderedLangs = [...TRANSLATE_LANGS].sort((x, y) => {
    const rank = (code) => {
      const q = quickLangs.indexOf(code);
      if (q >= 0) return q;
      return code === preferredLang ? quickLangs.length : quickLangs.length + 1;
    };
    return rank(x.code) - rank(y.code);
  });

  if (isTranslated) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onClear}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs transition hover:opacity-80"
          style={{ color: COLORS.teal }}
          title={t("video_translate.original")}
        >
          <X size={14} />
          {t("video_translate.original")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1.5" ref={ref}>
      <button
        type="button"
        disabled={loading || !text?.trim()}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs transition hover:opacity-80 disabled:opacity-40"
        style={{ color: COLORS.muted }}
        title={t("video_translate.translate")}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" style={{ color: COLORS.gold }} />
        ) : (
          <Languages size={16} />
        )}
        <span className="hidden sm:inline">{t("video_translate.translate")}</span>
        <ChevronDown size={12} />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] w-44 overflow-y-auto rounded-xl border shadow-2xl p-1.5"
            style={{
              left: pos.left,
              top: pos.top,
              maxHeight: pos.maxH,
              background: COLORS.surface2,
              borderColor: COLORS.borderGold,
            }}
          >
            {orderedLangs.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLang(l.code);
                    run(l.code);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm rounded-lg transition"
                  style={{
                    background: lang === l.code ? COLORS.goldGlow : "transparent",
                    color: lang === l.code ? COLORS.gold : COLORS.ivory,
                  }}
                >
                  {l.label}
                </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

export default TranslateButton;
