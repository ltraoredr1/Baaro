/**
 * Rendu léger du Markdown BAARO, sans dépendance react-markdown.
 *
 * Formats pris en charge :
 * - **gras**
 * - *italique*
 * - ++souligné++
 * - listes à puces
 * - listes numérotées
 * - liens [texte](url)
 * - URL HTTP/HTTPS nues
 */

import { COLORS } from "../theme.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value) {
  if (typeof value !== "string") return false;

  const url = value.trim();

  if (!url || /[\u0000-\u0020\u007f]/.test(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convertit les éléments Markdown en HTML.
 * Le texte utilisateur est échappé avant toute génération de balises.
 */
function formatInline(value) {
  const source = String(value ?? "");
  const tokens = [];

  // 1. Protège les liens Markdown avant les autres transformations.
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

  let html = source.replace(
    markdownLinkPattern,
    (match, label, url) => {
      if (!isSafeUrl(url)) return match;

      const token = `BAAROMARKDOWNLINK${tokens.length}TOKEN`;

      tokens.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline" style="color:#2DBFA6">${escapeHtml(label)}</a>`
      );

      return token;
    }
  );

  // 2. Échappe le texte pour empêcher l'injection de HTML.
  html = escapeHtml(html);

  // 3. Transforme les URL nues en liens sécurisés.
  html = html.replace(
    /(^|[\s(])((?:https?):\/\/[^\s<>"']+)/gi,
    (match, prefix, rawUrl) => {
      // Retire les signes de ponctuation de fin du lien.
      const url = rawUrl.replace(/[.,!?;:]+$/, "");
      const suffix = rawUrl.slice(url.length);

      if (!isSafeUrl(url)) {
        return match;
      }

      const safeUrl = escapeHtml(url);

      return (
        `${prefix}<a href="${safeUrl}" ` +
        'target="_blank" rel="noopener noreferrer" ' +
        'class="underline" style="color:#2DBFA6">' +
        `${safeUrl}</a>${suffix}`
      );
    }
  );

  // 4. Applique les mises en forme Markdown.
  // Le gras est traité avant l'italique.
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");

  // 5. Restaure les liens Markdown protégés.
  tokens.forEach((tokenHtml, index) => {
    const token = `BAAROMARKDOWNLINK${index}TOKEN`;

    html = html.replace(
      new RegExp(escapeRegExp(token), "g"),
      tokenHtml
    );
  });

  return html;
}

/**
 * Convertit le texte en paragraphes et listes HTML.
 * Les numéros de listes sont affichés par le navigateur.
 */
function toHtml(content) {
  const lines = String(content ?? "").split(/\r?\n/);
  const output = [];

  let listType = null;

  const closeList = () => {
    if (!listType) return;

    output.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  };

  for (const line of lines) {
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);

    if (unordered) {
      if (listType !== "ul") {
        closeList();

        output.push(
          '<ul class="list-disc list-inside mb-2 space-y-1">'
        );

        listType = "ul";
      }

      output.push(`<li>${formatInline(unordered[1])}</li>`);
      continue;
    }

    if (ordered) {
      if (listType !== "ol") {
        closeList();

        output.push(
          '<ol class="list-decimal list-inside mb-2 space-y-1">'
        );

        listType = "ol";
      }

      output.push(`<li>${formatInline(ordered[2])}</li>`);
      continue;
    }

    closeList();

    if (!line.trim()) {
      output.push('<div class="h-2" aria-hidden="true"></div>');
      continue;
    }

    output.push(
      `<p class="mb-2 last:mb-0 whitespace-pre-wrap">${formatInline(line)}</p>`
    );
  }

  closeList();

  return output.join("");
}

export function RichTextRenderer({ content, className = "" }) {
  if (content == null || content === "") {
    return null;
  }

  return (
    <div
      className={`rich-text text-sm leading-relaxed ${className}`}
      style={{ color: COLORS.ivory }}
      dangerouslySetInnerHTML={{ __html: toHtml(content) }}
    />
  );
}

export default RichTextRenderer;
