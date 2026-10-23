import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { COLORS } from "../../theme.js";
import { STEPS, stepText, ui } from "./guideContent.js";

/**
 * Visite guidée SANS IA.
 * Pour chaque étape : on ouvre l'onglet concerné, on entoure son bouton de
 * navigation (anneau doré) et on affiche une carte explicative. Rien ne bloque
 * l'écran : l'utilisateur peut toucher l'interface pendant la visite.
 */

// Retourne l'élément de navigation visible (desktop OU mobile) pour un onglet.
function findTarget(targetId) {
  const nodes = document.querySelectorAll(`[data-guide-tab="${targetId}"]`);
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

export default function GuideTour({
  lang,
  stepIndex,
  setStepIndex,
  onNavigate,
  onQuit,
  onAskAi,
  onChangeMode,
  isAnonymous,
}) {
  const t = ui(lang);
  const step = STEPS[stepIndex] || STEPS[0];
  const text = stepText(step, lang);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const [rect, setRect] = useState(null);

  // Ouvre l'onglet de l'étape. On garde onNavigate dans une ref : le parent le
  // recrée à chaque rendu, et on ne veut naviguer qu'au changement d'étape
  // (sinon la visite ramènerait l'utilisateur sur l'étape à chaque rendu).
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  useEffect(() => {
    if (step.tab) navigateRef.current?.(step.tab);
  }, [stepIndex, step.tab]);

  // Suit la position du bouton ciblé (la navigation peut se redessiner).
  useEffect(() => {
    if (!step.tab) {
      setRect(null);
      return undefined;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const next = findTarget(step.tab) || findTarget(step.target || "more");
      setRect((prev) => {
        if (!next && !prev) return prev;
        if (
          next &&
          prev &&
          Math.abs(prev.top - next.top) < 1 &&
          Math.abs(prev.left - next.left) < 1 &&
          Math.abs(prev.width - next.width) < 1
        ) {
          return prev;
        }
        return next;
      });
    };
    measure();
    const id = setInterval(measure, 350);
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [step.tab, step.target]);

  const go = (delta) => {
    const next = Math.min(Math.max(stepIndex + delta, 0), STEPS.length - 1);
    setStepIndex(next);
  };

  return (
    <>
      {/* Anneau autour du bouton de navigation */}
      {rect && (
        <div
          aria-hidden="true"
          className="baaro-guide-ring fixed z-[1090] pointer-events-none rounded-2xl"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            border: `2px solid ${COLORS.gold}`,
            boxShadow: `0 0 0 4px ${COLORS.goldGlow}, 0 0 24px ${COLORS.goldGlow}`,
            transition: "all 0.25s ease",
          }}
        />
      )}
      <style>{`.baaro-guide-ring{animation:baaroGuidePulse 1.4s ease-in-out infinite}
@keyframes baaroGuidePulse{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion: reduce){.baaro-guide-ring{animation:none}}`}</style>

      {/* Carte explicative */}
      <div
        role="dialog"
        aria-label={text.title}
        className="fixed z-[1100] left-3 right-3 bottom-[88px] md:left-auto md:right-6 md:bottom-6 md:w-[380px] rounded-3xl border shadow-2xl p-4"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.borderGold,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono" style={{ color: COLORS.muted }}>
            {t.step} {stepIndex + 1}/{STEPS.length}
          </span>
          <button
            type="button"
            onClick={onQuit}
            className="p-1.5 rounded-full hover:bg-white/10 transition"
            style={{ color: COLORS.muted }}
            aria-label={t.quit}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 mb-3" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i <= stepIndex ? COLORS.gold : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>

        <h3 className="text-base font-bold" style={{ color: COLORS.ivory }}>
          {text.title}
        </h3>
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: COLORS.mutedLight }}>
          {text.body}
        </p>
        {text.tip && (
          <p
            className="text-xs mt-2.5 px-3 py-2 rounded-xl leading-relaxed"
            style={{
              background: COLORS.tealGlow,
              color: COLORS.tealLight,
              border: `1px solid ${COLORS.borderTeal}`,
            }}
          >
            💡 {text.tip}
          </p>
        )}
        {isAnonymous && isFirst && (
          <p className="text-[11px] mt-2" style={{ color: COLORS.muted }}>
            {t.guestHint}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={isFirst}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border disabled:opacity-30 transition"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          >
            <ChevronLeft size={14} />
            {t.prev}
          </button>
          <button
            type="button"
            onClick={isLast ? onQuit : () => go(1)}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            {isLast ? t.finish : t.next}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>

        <div className="flex items-center justify-between mt-3 text-[11px]">
          <button
            type="button"
            onClick={() => onAskAi?.(text.title)}
            className="flex items-center gap-1 font-semibold hover:opacity-80"
            style={{ color: COLORS.gold }}
          >
            <Sparkles size={12} />
            {t.askAi}
          </button>
          <button
            type="button"
            onClick={onChangeMode}
            className="hover:opacity-80 underline underline-offset-2"
            style={{ color: COLORS.muted }}
          >
            {t.changeMode}
          </button>
        </div>
      </div>
    </>
  );
}
