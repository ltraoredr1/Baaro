import { Sparkles } from "lucide-react";
import { COLORS } from "../theme.js";

/**
 * Bouton "Demander à l'IA" à placer à côté de "Traduire" sous un post.
 * Envoie le texte au panneau IA flottant (FloatingAiAssistant).
 */
export function AskAiButton({ text }) {
  if (!text?.trim()) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("baaro:ask-ai", { detail: { text: text.trim() } })
        )
      }
      className="flex items-center gap-1.5 text-xs transition hover:opacity-80"
      style={{ color: COLORS.muted }}
      title="Demander à l'IA"
    >
      <Sparkles size={16} />
      <span className="hidden sm:inline">IA</span>
    </button>
  );
}

export default AskAiButton;
