import { useCallback, useEffect, useRef, useState } from "react";
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
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;

const AI_PROMPTS = {
  improve: "Améliore ce texte en conservant son sens et son ton.",
  correct: "Corrige l’orthographe, la grammaire et la ponctuation.",
  hashtags: "Propose des hashtags pertinents pour ce contenu.",
  summarize: "Résume ce texte de manière claire et concise.",
  translate: "Traduis ce texte en français naturel.",
};

function normalizeOptions(options) {
  if (!Array.isArray(options)) return ["", ""];

  const normalized = options
    .slice(0, MAX_POLL_OPTIONS)
    .map((option) => String(option ?? "").slice(0, 120));

  while (normalized.length < MIN_POLL_OPTIONS) {
    normalized.push("");
  }

  return normalized;
}

function normalizeMaxLength(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return MAX_LENGTH;

  return Math.max(0, Math.floor(number));
}

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
  const selectionFrameRef = useRef(null);
  const previousPollDataRef = useRef(pollData);

  const effectiveMaxLength = normalizeMaxLength(maxLength);
  const text = String(value ?? "").slice(0, effectiveMaxLength);

  const [showPollEditor, setShowPollEditor] = useState(
    Boolean(pollData)
  );
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [pollQuestion, setPollQuestion] = useState(
    String(pollData?.question ?? "").slice(0, 200)
  );
  const [pollOptions, setPollOptions] = useState(() =>
    normalizeOptions(pollData?.options)
  );

  useEffect(() => {
    if (previousPollDataRef.current === pollData) return;

    previousPollDataRef.current = pollData;

    setShowPollEditor(Boolean(pollData));
    setPollQuestion(
      String(pollData?.question ?? "").slice(0, 200)
    );
    setPollOptions(normalizeOptions(pollData?.options));
  }, [pollData]);

  useEffect(() => {
    return () => {
      if (selectionFrameRef.current !== null) {
        cancelAnimationFrame(selectionFrameRef.current);
      }
    };
  }, []);

  const updateText = useCallback(
    (nextValue) => {
      const next = String(nextValue ?? "").slice(
        0,
        effectiveMaxLength
      );

      onChange?.(next);

      return next;
    },
    [onChange, effectiveMaxLength]
  );

  const restoreSelection = useCallback((start, end = start) => {
    if (selectionFrameRef.current !== null) {
      cancelAnimationFrame(selectionFrameRef.current);
    }

    selectionFrameRef.current = requestAnimationFrame(() => {
      selectionFrameRef.current = null;

      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();

      const safeStart = Math.min(start, textarea.value.length);
      const safeEnd = Math.min(end, textarea.value.length);

      textarea.setSelectionRange(safeStart, safeEnd);
    });
  }, []);

  const insertAroundSelection = useCallback(
    (before, after = before) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = text.slice(start, end);

      const nextValue =
        text.slice(0, start) +
        before +
        selected +
        after +
        text.slice(end);

      const next = updateText(nextValue);

      const selectionStart = Math.min(
        start + before.length,
        next.length
      );
      const selectionEnd = Math.min(
        start + before.length + selected.length,
        next.length
      );

      restoreSelection(selectionStart, selectionEnd);
    },
    [text, updateText, restoreSelection]
  );

  const insertLinePrefix = useCallback(
    (prefix) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;

      const nextValue =
        text.slice(0, lineStart) +
        prefix +
        text.slice(lineStart);

      const next = updateText(nextValue);
      const cursor = Math.min(start + prefix.length, next.length);

      restoreSelection(cursor);
    },
    [text, updateText, restoreSelection]
  );

  const insertLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = text.slice(start, end);

    const urlInput = window.prompt(
      "Entre l’adresse du lien (https://…)"
    );

    if (!urlInput?.trim()) return;

    let parsedUrl;

    try {
      parsedUrl = new URL(urlInput.trim());
    } catch {
      window.alert(
        "Adresse invalide. Utilise une URL complète, par exemple https://example.com."
      );
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      window.alert("Seuls les liens HTTP et HTTPS sont autorisés.");
      return;
    }

    const label = selected || parsedUrl.href;
    const replacement = `[${label}](${parsedUrl.href})`;

    const nextValue =
      text.slice(0, start) +
      replacement +
      text.slice(end);

    const next = updateText(nextValue);
    const cursor = Math.min(start + replacement.length, next.length);

    restoreSelection(cursor);
  }, [text, updateText, restoreSelection]);

  const handleAiAction = useCallback(
    (type) => {
      const source = text.trim();
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
    [text]
  );

  const updatePoll = useCallback(
    (question, options) => {
      const safeQuestion = String(question ?? "").slice(0, 200);
      const safeOptions = normalizeOptions(options);

      setPollQuestion(safeQuestion);
      setPollOptions(safeOptions);

      const cleanedOptions = safeOptions
        .map((option) => option.trim())
        .filter(Boolean);

      if (
        safeQuestion.trim() &&
        cleanedOptions.length >= MIN_POLL_OPTIONS
      ) {
        onPollChange?.({
          question: safeQuestion.trim(),
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
        const cleanedOptions = pollOptions
          .map((option) => option.trim())
          .filter(Boolean);

        if (
          pollQuestion.trim() &&
          cleanedOptions.length >= MIN_POLL_OPTIONS
        ) {
          onPollChange?.({
            question: pollQuestion.trim(),
            options: cleanedOptions,
          });
        } else {
          onPollChange?.(null);
        }
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
      <Icon size={17} aria-hidden="true" />
    </button>
  );

  const aiButton = (type, label) => (
    <button
      key={type}
      type="button"
      onClick={() => handleAiAction(type)}
      className="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/10"
    >
      {label}
    </button>
  );

  return (
    <div className={`w-full space-y-3 ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="toolbar"
        aria-label="Mise en forme du texte"
      >
        {toolButton("Gras", Bold, () =>
          insertAroundSelection("**")
        )}

        {toolButton("Italique", Italic, () =>
          insertAroundSelection("*")
        )}

        {toolButton("Souligné", Underline, () =>
          insertAroundSelection("++")
        )}

        {toolButton("Barré", Strikethrough, () =>
          insertAroundSelection("~~")
        )}

        {toolButton("Code", Code, () =>
          insertAroundSelection("`")
        )}

        {toolButton("Citation", Quote, () =>
          insertLinePrefix("> ")
        )}

        {toolButton("Liste à puces", List, () =>
          insertLinePrefix("- ")
        )}

        {toolButton("Liste numérotée", ListOrdered, () =>
          insertLinePrefix("1. ")
        )}

        {toolButton("Ajouter un lien", LinkIcon, insertLink)}

        {toolButton("Créer un sondage", BarChart2, togglePoll)}

        <div className="relative">
          <button
            type="button"
            title="Assistant IA"
            aria-label="Assistant IA"
            aria-expanded={showAiMenu}
            aria-haspopup="menu"
            onClick={() => setShowAiMenu((previous) => !previous)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 text-sm transition hover:bg-amber-400/10"
          >
            <Sparkles size={16} aria-hidden="true" />
            IA
          </button>

          {showAiMenu && (
            <div
              role="menu"
              aria-label="Actions de l'assistant IA"
              className="absolute left-0 top-full z-30 mt-2 min-w-48 rounded-xl border border-white/10 bg-neutral-900 p-2 text-white shadow-xl"
            >
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
        value={text}
        onChange={(event) => updateText(event.target.value)}
        placeholder={placeholder}
        maxLength={effectiveMaxLength}
        rows={5}
        className="w-full resize-y rounded-xl border border-white/10 bg-transparent p-3 text-sm leading-relaxed text-current outline-none transition focus:border-amber-400/60"
        aria-label="Contenu de la publication"
      />

      <div className="flex items-center justify-between text-xs opacity-70">
        <span>Markdown pris en charge</span>
        <span aria-live="polite">
          {text.length}/{effectiveMaxLength}
        </span>
      </div>

      {showPollEditor && (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Créer un sondage
            </h4>

            <button
              type="button"
              onClick={togglePoll}
              aria-label="Fermer le sondage"
              className="rounded-lg p-2 transition hover:bg-white/10"
            >
              <Trash2 size={16} aria-hidden="true" />
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
            aria-label="Question du sondage"
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
                  aria-label={`Choix ${index + 1} du sondage`}
                />

                {pollOptions.length > MIN_POLL_OPTIONS && (
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
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {pollOptions.length < MAX_POLL_OPTIONS && (
            <button
              type="button"
              onClick={() => {
                updatePoll(pollQuestion, [...pollOptions, ""]);
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/10"
            >
              <Plus size={16} aria-hidden="true" />
              Ajouter un choix
            </button>
          )}
        </div>
      )}
    </div>
  );
}
