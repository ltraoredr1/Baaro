import { useState, useEffect } from "react";
import { X, Coins, Radio, Shield, ChevronRight } from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

const STORAGE_KEY = "baaro:onboarding_done";

/**
 * Onboarding 1 écran — visible une seule fois (localStorage).
 * Remplace : src/components/OnboardingModal.jsx
 * Objectif : comprendre BAARO en < 15 secondes.
 */
export function OnboardingModal({ forceOpen = false, onClose }) {
  const { isAnonymous } = useApp();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
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

  const pillars = [
    {
      icon: Coins,
      title: "Gagne des points",
      body: "Publie, like, commente, débat — chaque action rapporte des points convertibles en BARO.",
      color: COLORS.gold,
    },
    {
      icon: Radio,
      title: "Lives & débats + IA",
      body: "Lance ou rejoins un live. L’assistant IA peut co-animer avec toi.",
      color: COLORS.purple,
    },
    {
      icon: Shield,
      title: "Messagerie chiffrée",
      body: "Tes messages privés restent chiffrés de bout en bout. Le serveur ne les lit pas.",
      color: COLORS.teal,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={finish}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md glass-card rounded-3xl border shadow-2xl overflow-hidden"
        style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <span className="text-xs font-mono" style={{ color: COLORS.muted }}>
            Bienvenue
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

        {/* Title */}
        <div className="px-6 pt-2 pb-1 text-center">
          <h2
            id="onboarding-title"
            className="text-xl font-bold"
            style={{ color: COLORS.ivory }}
          >
            Pourquoi rester sur BAARO ?
          </h2>
          <p className="text-xs mt-1.5" style={{ color: COLORS.muted }}>
            En 10 secondes, ce qui change tout.
          </p>
        </div>

        {/* 3 piliers */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {pillars.map(({ icon: Icon, title, body, color }) => (
            <div
              key={title}
              className="flex items-start gap-3 p-3 rounded-2xl border"
              style={{
                background: `${color}10`,
                borderColor: `${color}33`,
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}22`, color }}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-bold"
                  style={{ color: COLORS.ivory }}
                >
                  {title}
                </p>
                <p
                  className="text-xs mt-0.5 leading-relaxed"
                  style={{ color: COLORS.muted }}
                >
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Mode invité */}
        {isAnonymous && (
          <div className="px-5 pb-2">
            <p
              className="text-xs px-3 py-2.5 rounded-xl border text-center leading-relaxed"
              style={{
                background: "rgba(236,72,153,0.08)",
                borderColor: "rgba(236,72,153,0.3)",
                color: COLORS.rose,
              }}
            >
              Tu es en mode invité : explore librement.
              <br />
              <span style={{ color: COLORS.ivory }}>
                Crée un compte gratuit pour gagner et convertir tes points.
              </span>
            </p>
          </div>
        )}

        {/* CTA unique */}
        <div className="px-5 pb-6 pt-3">
          <button
            onClick={finish}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
            }}
          >
            Commencer et gagner mes premiers points
            <ChevronRight size={18} />
          </button>
          <button
            onClick={finish}
            className="w-full mt-2 py-2 text-xs transition"
            style={{ color: COLORS.muted }}
          >
            Passer
          </button>
        </div>
      </div>
    </div>
  );
}
