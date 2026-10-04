import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { COLORS } from "../theme.js";

/**
 * Interface de création de sondage (2 à 4 options).
 * Retourne les données via onChange({ question, options }).
 */
export function PollComposer({ value, onChange, onClose }) {
  const question = value?.question || "";
  const options = value?.options?.length ? value.options : ["", ""];

  const update = (next) => onChange(next);

  const setQuestion = (q) => update({ question: q, options });
  const setOption = (index, text) => {
    const next = [...options];
    next[index] = text;
    update({ question, options: next });
  };

  const addOption = () => {
    if (options.length >= 4) return;
    update({ question, options: [...options, ""] });
  };

  const removeOption = (index) => {
    if (options.length <= 2) return;
    update({ question, options: options.filter((_, i) => i !== index) });
  };

  return (
    <div
      className="mb-3 p-3 rounded-xl border space-y-3"
      style={{
        background: COLORS.surface,
        borderColor: COLORS.borderTeal,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: COLORS.teal }}>
          Sondage
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10"
          style={{ color: COLORS.muted }}
          aria-label="Fermer le sondage"
        >
          <X size={14} />
        </button>
      </div>

      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Pose ta question..."
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
        maxLength={200}
      />

      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs w-5" style={{ color: COLORS.muted }}>
              {i + 1}.
            </span>
            <input
              type="text"
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
              maxLength={100}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-red-400/80"
                aria-label="Supprimer option"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < 4 && (
        <button
          type="button"
          onClick={addOption}
          className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg hover:bg-white/5"
          style={{ color: COLORS.teal }}
        >
          <Plus size={14} /> Ajouter une option
        </button>
      )}

      <p className="text-[10px]" style={{ color: COLORS.muted }}>
        2 à 4 options • Un vote par personne
      </p>
    </div>
  );
}
