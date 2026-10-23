import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Bot, Clock, HelpCircle, X } from "lucide-react";
import { COLORS } from "../../theme.js";
import GuideTour from "./GuideTour.jsx";
import GuideAiChat from "./GuideAiChat.jsx";
import { STEPS, guideLang, ui } from "./guideContent.js";

/**
 * Guide BAARO : comprendre l'application, avec ou sans IA (au choix).
 *
 *  - « Visite guidée » : pas à pas, 100 % local, sans réseau ni compte.
 *  - « Guide IA »      : questions libres + boutons qui ouvrent l'écran cité.
 *
 * Ouverture :
 *  - automatique, une seule fois, après l'introduction (si aucun choix mémorisé)
 *  - bouton flottant « ? »
 *  - depuis n'importe où : window.dispatchEvent(new CustomEvent("baaro:open-guide",
 *      { detail: { view: "choose" | "tour" | "ai" } }))
 */

export const GUIDE_OPEN_EVENT = "baaro:open-guide";
export const ONBOARDING_CLOSED_EVENT = "baaro:onboarding-closed";

const CHOICE_KEY = "baaro:guide_choice"; // "tour" | "ai" | "later"
const STEP_KEY = "baaro:guide_step";
const ONBOARDING_KEY = "baaro:onboarding_done";

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : on continue sans mémoire */
  }
};

function ChoiceCard({ icon: Icon, color, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition active:scale-[0.99] hover:bg-white/5"
      style={{ background: `${color}10`, borderColor: `${color}44` }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}22`, color }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold" style={{ color: COLORS.ivory }}>
          {title}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: COLORS.muted }}>
          {desc}
        </p>
      </div>
    </button>
  );
}

export default function GuideHost({
  activeTab,
  onNavigate,
  isAnonymous = false,
  displayName,
  suppressed = false, // vrai pendant que l'introduction est affichée
}) {
  const { i18n } = useTranslation();
  const lang = guideLang(i18n?.language);
  const t = ui(lang);

  const [view, setView] = useState(null); // null | "choose" | "tour" | "ai"
  const [stepIndex, setStepIndex] = useState(() => {
    const saved = Number(safeGet(STEP_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < STEPS.length ? saved : 0;
  });
  const [aiQuestion, setAiQuestion] = useState(null);

  const open = useCallback((next) => {
    if (next === "tour" || next === "ai" || next === "choose") setView(next);
    else {
      // Pas de vue précisée : on reprend le mode préféré, sinon on propose le choix.
      const pref = safeGet(CHOICE_KEY);
      setView(pref === "tour" || pref === "ai" ? pref : "choose");
    }
  }, []);

  // Ouverture à la demande depuis n'importe quel composant.
  useEffect(() => {
    const onOpen = (e) => open(e?.detail?.view);
    window.addEventListener(GUIDE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(GUIDE_OPEN_EVENT, onOpen);
  }, [open]);

  // Première ouverture automatique : une fois l'introduction terminée.
  useEffect(() => {
    if (suppressed || safeGet(CHOICE_KEY)) return undefined;
    const maybeOpen = () => {
      if (safeGet(CHOICE_KEY)) return;
      setView((v) => v || "choose");
    };
    if (safeGet(ONBOARDING_KEY)) {
      const id = setTimeout(maybeOpen, 1200);
      return () => clearTimeout(id);
    }
    window.addEventListener(ONBOARDING_CLOSED_EVENT, maybeOpen);
    return () => window.removeEventListener(ONBOARDING_CLOSED_EVENT, maybeOpen);
  }, [suppressed]);

  const choose = (choice) => {
    safeSet(CHOICE_KEY, choice);
    if (choice === "tour") {
      setStepIndex(0);
      safeSet(STEP_KEY, "0");
      setView("tour");
    } else if (choice === "ai") {
      setView("ai");
    } else {
      setView(null);
    }
  };

  const updateStep = (i) => {
    setStepIndex(i);
    safeSet(STEP_KEY, String(i));
  };

  const quitTour = () => {
    // Visite terminée ou quittée en route : on repart du début la prochaine fois
    // seulement si elle est allée au bout.
    if (stepIndex >= STEPS.length - 1) safeSet(STEP_KEY, "0");
    setView(null);
  };

  const askAiFromTour = (title) => {
    safeSet(CHOICE_KEY, "ai");
    setAiQuestion({ text: `${t.explainScreen} (${title})`, key: Date.now() });
    setView("ai");
  };

  const goFromChat = (tab) => {
    onNavigate?.(tab);
    setView(null);
  };

  return (
    <>
      {/* Bouton flottant « ? » (caché quand le guide est ouvert) */}
      {!suppressed && !view && (
        <button
          type="button"
          onClick={() => open()}
          className="fixed z-[1000] left-3 bottom-[88px] md:bottom-6 w-10 h-10 rounded-full flex items-center justify-center shadow-xl border active:scale-95 transition-transform"
          style={{
            background: COLORS.surface,
            borderColor: COLORS.borderGold,
            color: COLORS.gold,
          }}
          aria-label={t.help}
          title={t.help}
        >
          <HelpCircle size={20} />
        </button>
      )}

      {/* Choix du mode */}
      {view === "choose" && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => choose("later")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-choose-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border shadow-2xl p-5"
            style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="guide-choose-title"
                  className="text-lg font-bold"
                  style={{ color: COLORS.ivory }}
                >
                  {t.chooseTitle}
                </h2>
                <p className="text-xs mt-1" style={{ color: COLORS.muted }}>
                  {t.chooseSub}
                </p>
              </div>
              <button
                type="button"
                onClick={() => choose("later")}
                className="p-1.5 rounded-full hover:bg-white/10 transition"
                style={{ color: COLORS.muted }}
                aria-label={t.close}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 mt-4">
              <ChoiceCard
                icon={Compass}
                color={COLORS.teal}
                title={t.tourName}
                desc={t.tourDesc}
                onClick={() => choose("tour")}
              />
              <ChoiceCard
                icon={Bot}
                color={COLORS.gold}
                title={t.aiName}
                desc={t.aiDesc}
                onClick={() => choose("ai")}
              />
              <ChoiceCard
                icon={Clock}
                color={COLORS.muted}
                title={t.later}
                desc={t.laterDesc}
                onClick={() => choose("later")}
              />
            </div>
          </div>
        </div>
      )}

      {view === "tour" && (
        <GuideTour
          lang={lang}
          stepIndex={stepIndex}
          setStepIndex={updateStep}
          onNavigate={onNavigate}
          onQuit={quitTour}
          onAskAi={askAiFromTour}
          onChangeMode={() => setView("choose")}
          isAnonymous={isAnonymous}
        />
      )}

      {view === "ai" && (
        <GuideAiChat
          lang={lang}
          activeTab={activeTab}
          displayName={displayName}
          initialQuestion={aiQuestion}
          onNavigate={goFromChat}
          onClose={() => setView(null)}
          onChangeMode={() => {
            safeSet(CHOICE_KEY, "tour");
            setView("tour");
          }}
        />
      )}
    </>
  );
}
