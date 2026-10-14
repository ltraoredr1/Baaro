import { useState, useEffect } from "react";
import { Bot, X } from "lucide-react";
import { COLORS } from "../theme.js";
// ⚠️ Ajuste ce chemin vers ton vrai dossier (ex: ../features/ai/AiAssistantTab.jsx)
import AiAssistantTab from "../features/ai/AiAssistantTab.jsx";

/**
 * Bouton flottant + panneau IA, visible sur toutes les pages.
 * À monter UNE SEULE FOIS dans MainShell.
 *
 * Props :
 *  - userProfile
 *  - onPublishAction(text) : optionnel
 *  - hidden : true sur l'onglet IA pour éviter le doublon
 */
export default function FloatingAiAssistant({
  userProfile,
  onPublishAction,
  hidden = false,
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);

  // Écoute des boutons "Demander à l'IA" placés sur les posts
  useEffect(() => {
    const onAsk = (e) => {
      const text = e.detail?.text;
      if (!text) return;
      setPrefill({
        text: `À propos de ce texte :\n"${text}"\n\n`,
        key: Date.now(),
      });
      setOpen(true);
    };
    window.addEventListener("baaro:ask-ai", onAsk);
    return () => window.removeEventListener("baaro:ask-ai", onAsk);
  }, []);

  // Fermer avec Échap
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      {/* Le panneau reste monté (juste caché) pour garder la conversation */}
      <div
        className={`fixed z-[1001] flex flex-col rounded-2xl border shadow-2xl
          inset-x-2 bottom-20 top-16
          sm:inset-x-auto sm:right-5 sm:w-[400px] sm:top-auto sm:h-[620px]
          ${open ? "" : "hidden"}`}
        style={{
          background: COLORS.bg || "#0b0b0b",
          borderColor: COLORS.borderGold,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 text-white"
          aria-label="Fermer l'assistant"
        >
          <X size={16} />
        </button>
        <div className="flex-1 overflow-y-auto p-3 pt-10">
          <AiAssistantTab
            userProfile={userProfile}
            onPublishAction={onPublishAction}
            prefill={prefill}
          />
        </div>
      </div>

      {/* Bouton flottant */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-[1000] right-4 bottom-20 sm:bottom-6 w-14 h-14 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          style={{ background: COLORS.gold, color: "#000" }}
          aria-label="Ouvrir l'assistant IA"
        >
          <Bot size={26} />
        </button>
      )}
    </>
  );
}
