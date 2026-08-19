import { useState, useEffect } from "react";
import { X, Coins, MessageCircle, Radio, Shield, ChevronRight, ChevronLeft } from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

const STORAGE_KEY = "baaro:onboarding_done";

const STEPS = [
  {
    icon: Coins,
    title: "Gagne des points",
    body: "Publie, like, commente et participe aux débats pour accumuler des points. Convertis-les ensuite en BARO Coin.",
    color: COLORS.gold,
  },
  {
    icon: MessageCircle,
    title: "Messagerie sécurisée",
    body: "Échange en privé avec un chiffrement de bout en bout. Tes messages restent sur ton appareil.",
    color: COLORS.teal,
  },
  {
    icon: Radio,
    title: "Lives & débats",
    body: "Rejoins ou lance des lives, débat en temps réel, et invite l'assistant IA comme co-animateur.",
    color: COLORS.purple,
  },
  {
    icon: Shield,
    title: "Compte invité vs réel",
    body: "En invité tu explores librement. Crée un compte (email ou réseau social) pour gagner des points, convertir en BARO et accéder aux récompenses.",
    color: COLORS.rose,
  },
];

/**
 * Onboarding affiché une seule fois (localStorage).
 * Peut être forcé via prop forceOpen (ex. depuis Settings).
 */
export function OnboardingModal({ forceOpen = false, onClose }) {
  const { isAnonymous } = useApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [forceOpen]);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    onClose?.();
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={finish}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-card rounded-3xl border shadow-2xl overflow-hidden"
        style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-xs font-mono" style={{ color: COLORS.muted }}>
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={finish}
            className="p-1.5 rounded-lg hover:opacity-80 transition"
            style={{ color: COLORS.muted }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: `${current.color}22`, color: current.color }}
          >
            <Icon size={32} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: COLORS.ivory }}>
            {current.title}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: COLORS.muted }}>
            {current.body}
          </p>

          {isAnonymous && step === STEPS.length - 1 && (
            <p
              className="text-xs px-3 py-2 rounded-xl border w-full"
              style={{
                background: "rgba(236,72,153,0.08)",
                borderColor: "rgba(236,72,153,0.3)",
                color: COLORS.rose,
              }}
            >
              Tu es actuellement en mode invité. Crée un compte pour débloquer les gains.
            </p>
          )}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i === step ? COLORS.gold : COLORS.border,
                width: i === step ? 16 : 8,
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-6 pt-3">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-xs font-bold border transition"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            >
              <ChevronLeft size={16} />
              Retour
            </button>
          ) : (
            <button
              onClick={finish}
              className="px-4 py-2.5 rounded-xl text-xs font-medium transition"
              style={{ color: COLORS.muted }}
            >
              Passer
            </button>
          )}

          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            {isLast ? "C'est parti" : "Suivant"}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
