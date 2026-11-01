/**
 * src/features/messaging/components/AutoTranslateToggle.jsx
 *
 * Bouton « Traduction directe » de l'en-tête d'une conversation.
 * Activé : chaque message reçu s'affiche automatiquement dans la langue de
 * l'interface (ex. Bambara → Français pour quelqu'un en France, Français →
 * Bambara pour quelqu'un à Ségou). Un avis de confidentialité est montré avant
 * la première activation.
 */
import React, { useState } from "react";
import { Languages } from "lucide-react";
import { langLabel } from "../../../lib/translateApi.js";
import { chatTargetLang, setAutoTranslate, useAutoTranslate } from "../lib/autoTranslate.js";

export function AutoTranslateToggle({ color = "#D9AE52" }) {
  const on = useAutoTranslate();
  const [asking, setAsking] = useState(false);

  const toggle = () => {
    if (on) {
      setAutoTranslate(false);
      setAsking(false);
    } else {
      setAsking((v) => !v);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "Désactiver la traduction directe" : "Activer la traduction directe"}
        title={on ? "Traduction directe activée" : "Traduction directe"}
        className="relative p-2.5 rounded-full hover:bg-white/10"
        style={{ color }}
      >
        <Languages size={18} />
        {on && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2"
            style={{ background: "#22c55e", borderColor: "#0B1220" }}
          />
        )}
      </button>

      {asking && !on && (
        <div
          role="dialog"
          aria-label="Traduction directe"
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-2xl border p-3 text-xs shadow-2xl"
          style={{ background: "#141C2E", borderColor: "rgba(217,174,82,0.35)", color: "#F5F3EF" }}
        >
          <p className="font-bold text-sm mb-1">Traduction directe</p>
          <p className="opacity-80 leading-snug mb-1.5">
            Les messages que tu reçois s'affichent automatiquement en {langLabel(chatTargetLang())} (Bambara ⇄
            Français).
          </p>
          <p className="opacity-70 leading-snug mb-2.5">
            Pour cela, chaque message reçu est envoyé, un par un, au service de traduction BAARO, en dehors du
            chiffrement de bout en bout. BAARO ne l'enregistre pas. Tu peux couper ce mode à tout moment.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAutoTranslate(true);
                setAsking(false);
              }}
              className="px-3 py-1.5 rounded-full font-semibold"
              style={{ background: "#D9AE52", color: "#0B1220" }}
            >
              Activer
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AutoTranslateToggle;
