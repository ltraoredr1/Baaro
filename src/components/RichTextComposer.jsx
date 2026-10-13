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
 * Éditeur de texte riche pour les publications BAARO.
 * Génère du Markdown :
 * - **gras**
 * - *italique*
 * - ++souligné++
 * - [texte](url)
 * - listes à puces et numérotées
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
      const safeStart = Math.min(Math.max(start, 0), maxLength);
      const safeEnd = Math.min(Math.max(end, safeStart), maxLength);

      el.setSelectionRange(safeStart, safeEnd);
    });
  }, []);

  /**
   * Applique un formatage autour du texte sélectionné.
   * Sans sélection, insère les marqueurs et place le curseur
   * à l'intérieur pour permettre de taper directement.
   */
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
        restoreSelection(start + before.length);
      }
    },
    [text, disabled, updateText, restoreSelection]
  );

  /**
   * Insère du texte à la position du curseur.
   */
  const insertAtCursor = useCallback(
    (insertedText) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      const newText =
        text.slice(0, start) + insertedText + text.slice(end);

      updateText(newText);
      restoreSelection(start + insertedText.length);
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

  /**
   * Ajoute un lien Markdown sécurisé.
   */
  const handleLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el || disabled) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end) || "lien";

    const enteredUrl = window.prompt(
      "Collez le lien (site ou groupe BAARO) :",
      "https://"
    );

    if (!enteredUrl) {
      restoreSelection(start, end);
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

    // Sélectionne le libellé du lien après insertion.
    restoreSelection(start + 1, start + 1 + selected.length);
  }, [text, disabled, updateText, restoreSelection]);

  /**
   * Insère une puce ou un numéro.
   * Pour les listes numérotées, recherche le dernier numéro
   * présent avant la ligne courante et l'incrémente.
   */
  const insertListMarker = useCallback(
    (type) => {
      const el = textareaRef.current;
      if (!el || disabled) return;

      const start = el.selectionStart;
      const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const beforeCursor = text.slice(lineStart, start);

      let marker;

      if (type === "ul") {
        marker = "- ";
      } else {
        const previousText = text.slice(0, lineStart);
        const matches = [
          ...previousText.matchAll(/^\s*(\d+)\.\s+/gm),
        ];

        const lastNumber = matches.length
          ? Number(matches[matches.length - 1][1])
          : 0;

        marker = `${lastNumber + 1}. `;
      }

      const insertion =
        beforeCursor.trim() === "" ? marker : `\n${marker}`;

      insertAtCursor(insertion);
    },
    [text, disabled, insertAtCursor]
  );

  const handleBulletList = useCallback(() => {
    insertListMarker("ul");
  }, [insertListMarker]);

  const handleOrderedList = useCallback(() => {
    insertListMarker("ol");
  }, [insertListMarker]);

  /**
   * Permet de poursuivre automatiquement une liste numérotée
   * ou à puces avec la touche Entrée.
   */
  const handleKeyDown = useCallback(
    (event) => {
      if (disabled) return;

      // Raccourcis clavier pour le gras et l'italique.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();

        if (key === "b") {
          event.preventDefault();
          handleBold();
          return;
        }

        if (key === "i") {
          event.preventDefault();
          handleItalic();
          return;
        }
      }

      if (event.key !== "Enter" || event.shiftKey) return;

      const el = textareaRef.current;
      if (!el || el.selectionStart !== el.selectionEnd) return;

      const cursor = el.selectionStart;
      const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
      const lineEndIndex = text.indexOf("\n", cursor);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
      const currentLine = text.slice(lineStart, lineEnd);

      const unorderedMatch = currentLine.match(/^(\s*)[-*]\s+(.*)$/);
      const orderedMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

      if (!unorderedMatch && !orderedMatch) return;

      const contentBeforeCursor = text.slice(lineStart, cursor);
      const contentAfterCursor = text.slice(cursor, lineEnd);

      // Une ligne vide de liste : retire le marqueur et termine la liste.
      if (
        (unorderedMatch && !unorderedMatch[2].trim()) ||
        (orderedMatch && !orderedMatch[3].trim())
      ) {
        event.preventDefault();

        const markerLength = unorderedMatch
          ? unorderedMatch[1].length + 2
          : orderedMatch[1].length + orderedMatch[2].length + 2;

        const newText =
          text.slice(0, lineStart) +
          text.slice(lineStart + markerLength, lineEnd) +
          text.slice(lineEnd);

        updateText(newText);
        restoreSelection(lineStart);
        return;
      }

      event.preventDefault();

      let nextMarker;

      if (unorderedMatch) {
        nextMarker = `${unorderedMatch[1]}- `;
      } else {
        nextMarker = `${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `;
      }

      const insertion = `\n${nextMarker}`;

      const newText =
        text.slice(0, cursor) + insertion + text.slice(cursor);

      updateText(newText);
      restoreSelection(cursor + insertion.length);
    },
    [
      text,
      disabled,
      updateText,
      restoreSelection,
      handleBold,
      handleItalic,
    ]
  );

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
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
        style={{ color: COLORS.ivory }}
      />
    </div>
  );
}
