
import { useCallback, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
  Sparkles,
  BarChart2,
  Plus,
  Trash2,
  Strikethrough,
  Quote,
  Code,
} from "lucide-react";

const MAX_LENGTH = 10000;

const AI_PROMPTS = {
  improve: "Améliore ce texte en conservant son sens et son ton.",
  correct: "Corrige l’orthographe, la grammaire et la ponctuation.",
  hashtags: "Propose des hashtags pertinents pour ce contenu.",
  summarize: "Résume ce texte de manière claire et concise.",
  translate: "Traduis ce texte en français naturel.",
};

export default function RichTextComposer({
  value = "",
  onChange,
  placeholder = "Exprime-toi…",
  maxLength = MAX_LENGTH,
  pollData = null,
  onPollChange,
  className = "",
}) {
  const textareaRef = useRef(null);
  const [showPollEditor, setShowPollEditor] = useState(Boolean(pollData));
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [pollQuestion, setPollQuestion] = useState(pollData?.question || "");
  const [pollOptions, setPollOptions] = useState(
    pollData?.options?.length >= 2
      ? pollData.options
      : ["", ""]
  );

  const updateText = useCallback(
    (nextValue) => {
      onChange?.(String(nextValue).slice(0, maxLength));
    },
    [onChange, maxLength]
  );

  const insertAroundSelection = useCallback(
    (before, after = before) => {
      const textarea = textareaRef.current;

      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = String(value);
      const selected = text.slice(start, end);
      const next =
        text.slice(0, start) +
        before +
        selected +
        after +
        text.slice(end);

      updateText(next);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + before.length,
          end + before.length
        );
      });
    },
    [value, updateText]
  );

  const insertLinePrefix = useCallback(
    (prefix) => {
      const textarea = textareaRef.current;

      if (!textarea) return;

      const text = String(value);
      const start = textarea.selectionStart;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);

      updateText(next);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length
        );
      });
    },
    [value, updateText]
  );

  const insertLink = useCallback(() => {
    const textarea = textareaRef.current;
    const text = String(value);

    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = text.slice(start, end);

    const url = window.prompt("Entre l’adresse du lien (https://…)");

    if (!url) return;

    let parsedUrl;

    try {
      parsedUrl = new URL(url.trim());
    } catch {
      window.alert("Adresse invalide. Utilise une URL complète.");
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      window.alert("Seuls les liens HTTP et HTTPS sont autorisés.");
      return;
    }

    const label = selected || parsedUrl.href;
    const replacement = `[${label}](${parsedUrl.href})`;
    const next = text.slice(0, start) + replacement + text.slice(end);

    updateText(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + replacement.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }, [value, updateText]);

  const handleAiAction = useCallback(
    (type) => {
      const source = String(value).trim();
      const prompt = AI_PROMPTS[type] || AI_PROMPTS.improve;

      setShowAiMenu(false);

      window.dispatchEvent(
        new CustomEvent("baaro:ask-ai", {
          detail: {
            prompt:
              `${prompt}\n\nContenu :\n` +
              `${source || "Propose une idée originale de publication pour BAARO."}\n\n` +
              "Donne uniquement le résultat prêt à utiliser.",
            source,
            action: type,
          },
        })
      );
    },
    [value]
  );

  const updatePoll = useCallback(
    (question, options) => {
      setPollQuestion(question);
      setPollOptions(options);

      const cleanedOptions = options
        .map((option) => option.trim())
        .filter(Boolean);

      if (question.trim() && cleanedOptions.length >= 2) {
        onPollChange?.({
          question: question.trim(),
          options: cleanedOptions,
        });
      } else {
        onPollChange?.(null);
      }
    },
    [onPollChange]
  );

  const togglePoll = useCallback(() => {
    setShowPollEditor((previous) => {
      const next = !previous;

      if (!next) {
        onPollChange?.(null);
      } else {
        onPollChange?.({
          question: pollQuestion,
          options: pollOptions.filter((option) => option.trim()),
        });
      }

      return next;
    });
  }, [onPollChange, pollQuestion, pollOptions]);

  const toolButton = (label, Icon, action, disabled = false) => (
    <button
      key={label}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={action}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-current transition hover:bg-white/10 disabled:opacity-40"
    >
      <Icon size={17} />
    </button>
  );

  const aiButton = (type, label) => (
    <button
      key={type}
      type="button"
      disabled={aiLoading}
      onClick={() => handleAiAction(type)}
      className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10 disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <div className={`w-full space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {toolButton("Gras", Bold, () => insertAroundSelection("**"))}
        {toolButton("Italique", Italic, () => insertAroundSelection("*"))}
        {toolButton(
          "Souligné",
          Underline,
          () => insertAroundSelection("++")
        )}
        {toolButton(
          "Barré",
          Strikethrough,
          () => insertAroundSelection("~~")
        )}
        {toolButton("Code", Code, () => insertAroundSelection("`"))}
        {toolButton("Citation", Quote, () => insertLinePrefix("> "))}
        {toolButton("Liste à puces", List, () => insertLinePrefix("- "))}
        {toolButton(
          "Liste numérotée",
          ListOrdered,
          () => insertLinePrefix("1. ")
        )}
        {toolButton("Ajouter un lien", LinkIcon, insertLink)}
        {toolButton("Créer un sondage", BarChart2, togglePoll)}

        <div className="relative">
          <button
            type="button"
            title="Assistant IA"
            aria-label="Assistant IA"
            onClick={() => setShowAiMenu((previous) => !previous)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 text-sm transition hover:bg-amber-400/10"
          >
            <Sparkles size={16} />
            IA
          </button>

          {showAiMenu && (
            <div className="absolute left-0 top-full z-30 mt-2 min-w-48 rounded-xl border border-white/10 bg-neutral-900 p-2 text-white shadow-xl">
              {aiButton("improve", "✨ Améliorer le texte")}
              {aiButton("correct", "✓ Corriger les fautes")}
              {aiButton("hashtags", "# Générer des hashtags")}
              {aiButton("summarize", "Résumé")}
              {aiButton("translate", "Traduire en français")}
            </div>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => updateText(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={5}
        className="w-full resize-y rounded-xl border border-white/10 bg-transparent p-3 text-sm leading-relaxed text-current outline-none transition focus:border-amber-400/60"
      />

      <div className="flex items-center justify-between text-xs opacity-70">
        <span>Markdown pris en charge</span>
        <span>
          {String(value).length}/{maxLength}
        </span>
      </div>

      {showPollEditor && (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Créer un sondage</h4>
            <button
              type="button"
              onClick={togglePoll}
              aria-label="Fermer le sondage"
              className="rounded-lg p-2 transition hover:bg-white/10"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <input
            type="text"
            value={pollQuestion}
            onChange={(event) =>
              updatePoll(event.target.value, pollOptions)
            }
            placeholder="Pose ta question…"
            maxLength={200}
            className="w-full rounded-lg border border-white/10 bg-transparent p-2 text-sm outline-none focus:border-amber-400/60"
          />

          <div className="space-y-2">
            {pollOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(event) => {
                    const next = [...pollOptions];
                    next[index] = event.target.value;
                    updatePoll(pollQuestion, next);
                  }}
                  placeholder={`Choix ${index + 1}`}
                  maxLength={120}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-transparent p-2 text-sm outline-none focus:border-amber-400/60"
                />

                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Supprimer le choix ${index + 1}`}
                    onClick={() => {
                      const next = pollOptions.filter(
                        (_, optionIndex) => optionIndex !== index
                      );
                      updatePoll(pollQuestion, next);
                    }}
                    className="rounded-lg p-2 transition hover:bg-white/10"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {pollOptions.length < 4 && (
            <button
              type="button"
              onClick={() => {
                updatePoll(pollQuestion, [...pollOptions, ""]);
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10"
            >
              <Plus size={16} />
              Ajouter un choix
            </button>
          )}
        </div>
      )}
    </div>
  );
}
