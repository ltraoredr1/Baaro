
import { Plus, Trash2, X } from "lucide-react";
import { COLORS } from "../theme.js";

/**
 * Interface de création de sondage (2 à 4 options).
 * Retourne les données via onChange({ question, options }).
 */
export function PollComposer({ value, onChange, onClose }) {
  const question =
    typeof value?.question === "string" ? value.question : "";

  const options =
    Array.isArray(value?.options) &&
    value.options.length >= 2 &&
    value.options.length <= 4
      ? value.options.map((option) =>
          typeof option === "string" ? option : ""
        )
      : ["", ""];

  const update = (next) => {
    if (typeof onChange === "function") {
      onChange(next);
    }
  };

  const setQuestion = (nextQuestion) => {
    update({
      question: nextQuestion.slice(0, 200),
      options,
    });
  };

  const setOption = (index, text) => {
    if (index < 0 || index >= options.length) return;

    const nextOptions = [...options];
    nextOptions[index] = text.slice(0, 100);

    update({
      question,
      options: nextOptions,
    });
  };

  const addOption = () => {
    if (options.length >= 4) return;

    update({
      question,
      options: [...options, ""],
    });
  };

  const removeOption = (index) => {
    if (options.length <= 2) return;
    if (index < 0 || index >= options.length) return;

    update({
      question,
      options: options.filter((_, i) => i !== index),
    });
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
        <span
          className="text-xs font-bold"
          style={{ color: COLORS.teal }}
        >
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
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Pose ta question..."
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
        style={{
          background: COLORS.surface2,
          borderColor: COLORS.border,
          color: COLORS.ivory,
        }}
        maxLength={200}
        aria-label="Question du sondage"
      />

      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="text-xs w-5 shrink-0"
              style={{ color: COLORS.muted }}
              aria-hidden="true"
            >
              {index + 1}.
            </span>

            <input
              type="text"
              value={option}
              onChange={(event) =>
                setOption(index, event.target.value)
              }
              placeholder={`Option ${index + 1}`}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{
                background: COLORS.surface2,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
              maxLength={100}
              aria-label={`Option ${index + 1}`}
            />

            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(index)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-red-400/80 shrink-0"
                aria-label={`Supprimer l’option ${index + 1}`}
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
          <Plus size={14} />
          Ajouter une option
        </button>
      )}

      <p className="text-[10px]" style={{ color: COLORS.muted }}>
        2 à 4 options • Un vote par personne
      </p>
    </div>
  );
}
