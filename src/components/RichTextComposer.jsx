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
  value = "",
  onChange,
  placeholder = "Quoi de neuf ?",
  rows = 3,
  disabled = false,
  className = "",
}) {
  const textareaRef = useRef(null);

  const text = typeof value === "string" ? value : "";

  const updateText = useCallback(
    (nextValue) => {
      if (typeof onChange === "function") {
        onChange(nextValue);
      }
    },
    [onChange]
  );

  const restoreSelection = useCallback((start, end = start) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;

      el.focus();

      const maxLength = el.value.length;
      const safeStart = Math.min(Math.max(0, start), maxLength);
      const safeEnd = Math.min(Math.max(safeStart, end), maxLength);

      el.setSelectionRange(safeStart, safeEnd);
    });
  }, []);

  const wrapSelection = useCallback(
    (before, after = before) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = text.slice(start, end);

      const newText =
        text.slice(0, start) +
        before +
        selected +
        after +
        text.slice(end);

      updateText(newText);

      if (selected.length > 0) {
        restoreSelection(
          start + before.length,
          start + before.length + selected.length
        );
      } else {
        const cursor = start + before.length;
        restoreSelection(cursor);
      }
    },
    [text, disabled, updateText, restoreSelection]
  );

  const insertAtCursor = useCallback(
    (insertedText) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      const newText =
        text.slice(0, start) + insertedText + text.slice(end);

      updateText(newText);

      const cursor = start + insertedText.length;
      restoreSelection(cursor);
    },
    [text, disabled, updateText, restoreSelection]
  );

  const handleBold = useCallback(() => {
    wrapSelection("**");
  }, [wrapSelection]);

  const handleItalic = useCallback(() => {
    wrapSelection("*");
  }, [wrapSelection]);

  const handleUnderline = useCallback(() => {
    wrapSelection("++");
  }, [wrapSelection]);

  const handleLink = useCallback(() => {
    if (disabled) return;

    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end) || "lien";

    const enteredUrl = window.prompt(
      "Collez le lien (site ou groupe Baaro) :",
      "https://"
    );

    if (!enteredUrl) {
      el.focus();
      el.setSelectionRange(start, end);
      return;
    }

    const url = enteredUrl.trim();

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      window.alert("Veuillez saisir une URL valide.");
      restoreSelection(start, end);
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      window.alert("Seuls les liens HTTP et HTTPS sont autorisés.");
      restoreSelection(start, end);
      return;
    }

    const markdown = `[${selected}](${url})`;

    const newText =
      text.slice(0, start) + markdown + text.slice(end);

    updateText(newText);

    const selectionStart = start + 1;
    const selectionEnd = selectionStart + selected.length;

    restoreSelection(selectionStart, selectionEnd);
  }, [text, disabled, updateText, restoreSelection]);

  const insertListMarker = useCallback(
    (marker) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      // Détermine le début de la ligne où se trouve le curseur.
      const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const beforeCursor = text.slice(lineStart, start);

      // Si le curseur est déjà au début d'une ligne vide,
      // insère le marqueur directement. Sinon, commence une nouvelle ligne.
      const prefix = beforeCursor.trim() === "" ? marker : `\n${marker}`;

      insertAtCursor(prefix);
    },
    [text, disabled, insertAtCursor]
  );

  const handleBulletList = useCallback(() => {
    insertListMarker("- ");
  }, [insertListMarker]);

  const handleOrderedList = useCallback(() => {
    insertListMarker("1. ");
  }, [insertListMarker]);

  const btnClass =
    "p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Barre d'outils */}
      <div
        className="flex items-center gap-0.5 flex-wrap px-1 py-1 rounded-xl border"
        style={{
          background: COLORS.surface,
          borderColor: COLORS.border,
        }}
        role="toolbar"
        aria-label="Mise en forme du texte"
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
          <Bold size={16} aria-hidden="true" />
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
          <Italic size={16} aria-hidden="true" />
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
          <Underline size={16} aria-hidden="true" />
        </button>

        <div
          className="w-px h-4 mx-1"
          style={{ background: COLORS.border }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={handleLink}
          disabled={disabled}
          className={btnClass}
          title="Insérer un lien"
          aria-label="Lien"
          style={{ color: COLORS.gold }}
        >
          <LinkIcon size={16} aria-hidden="true" />
        </button>

        <div
          className="w-px h-4 mx-1"
          style={{ background: COLORS.border }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={handleBulletList}
          disabled={disabled}
          className={btnClass}
          title="Liste à puces"
          aria-label="Liste à puces"
          style={{ color: COLORS.ivory }}
        >
          <List size={16} aria-hidden="true" />
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
          <ListOrdered size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Zone de saisie */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => updateText(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
        style={{ color: COLORS.ivory }}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

          const key = event.key.toLowerCase();

          if (key === "b") {
            event.preventDefault();
            handleBold();
          } else if (key === "i") {
            event.preventDefault();
            handleItalic();
          }
        }}
      />
    </div>
  );
}
