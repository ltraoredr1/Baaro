import { useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { COLORS } from "../theme.js";

/**
 * Éditeur de texte riche pour les publications.
 * Génère du Markdown + syntaxe ++souligné++.
 * Toolbar : Gras, Italique, Souligné, Lien, Listes.
 */
export function RichTextComposer({
  value,
  onChange,
  placeholder = "Quoi de neuf ?",
  rows = 3,
  disabled = false,
  className = "",
}) {
  const textareaRef = useRef(null);

  const wrapSelection = useCallback(
    (before, after = before) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);
      const newText =
        value.slice(0, start) + before + selected + after + value.slice(end);

      onChange(newText);

      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + before.length + selected.length + after.length;
        el.setSelectionRange(
          selected ? start + before.length : cursor,
          selected ? start + before.length + selected.length : cursor
        );
      });
    },
    [value, onChange, disabled]
  );

  const insertAtCursor = useCallback(
    (text) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newText = value.slice(0, start) + text + value.slice(end);

      onChange(newText);

      requestAnimationFrame(() => {
        el.focus();
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [value, onChange, disabled]
  );

  const handleBold = () => wrapSelection("**");
  const handleItalic = () => wrapSelection("*");
  const handleUnderline = () => wrapSelection("++");

  const handleLink = () => {
    const url = window.prompt("Collez le lien (site ou groupe Baaro) :", "https://");
    if (!url) return;

    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selected = value.slice(start, end) || "lien";

    const markdown = `[${selected}](${url.trim()})`;
    const newText = value.slice(0, start) + markdown + value.slice(end);
    onChange(newText);

    requestAnimationFrame(() => {
      el?.focus();
    });
  };

  const handleBulletList = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    insertAtCursor(value.slice(lineStart, start).trim() === "" ? "- " : "\n- ");
  };

  const handleOrderedList = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    insertAtCursor(value.slice(lineStart, start).trim() === "" ? "1. " : "\n1. ");
  };

  const btnClass =
    "p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 flex-wrap px-1 py-1 rounded-xl border"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.border,
        }}
      >
        <button
          type="button"
          onClick={handleBold}
          disabled={disabled}
          className={btnClass}
          title="Gras (Ctrl+B)"
          aria-label="Gras"
          style={{ color: COLORS.ivory }}
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={handleItalic}
          disabled={disabled}
          className={btnClass}
          title="Italique (Ctrl+I)"
          aria-label="Italique"
          style={{ color: COLORS.ivory }}
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={handleUnderline}
          disabled={disabled}
          className={btnClass}
          title="Souligné"
          aria-label="Souligné"
          style={{ color: COLORS.ivory }}
        >
          <Underline size={16} />
        </button>

        <div className="w-px h-4 mx-1" style={{ background: COLORS.border }} />

        <button
          type="button"
          onClick={handleLink}
          disabled={disabled}
          className={btnClass}
          title="Insérer un lien"
          aria-label="Lien"
          style={{ color: COLORS.gold }}
        >
          <LinkIcon size={16} />
        </button>

        <div className="w-px h-4 mx-1" style={{ background: COLORS.border }} />

        <button
          type="button"
          onClick={handleBulletList}
          disabled={disabled}
          className={btnClass}
          title="Liste à puces"
          aria-label="Liste à puces"
          style={{ color: COLORS.ivory }}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={handleOrderedList}
          disabled={disabled}
          className={btnClass}
          title="Liste numérotée"
          aria-label="Liste numérotée"
          style={{ color: COLORS.ivory }}
        >
          <ListOrdered size={16} />
        </button>
      </div>

      {/* Zone de saisie */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
        style={{ color: COLORS.ivory }}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) {
            if (e.key === "b") {
              e.preventDefault();
              handleBold();
            } else if (e.key === "i") {
              e.preventDefault();
              handleItalic();
            }
          }
        }}
      />
    </div>
  );
}
