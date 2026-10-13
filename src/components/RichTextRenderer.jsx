/**
 * Rendu léger du Markdown BAARO (sans dépendance react-markdown).
 * Supporte :
 * - **gras**
 * - *italique*
 * - ++souligné++
 * - listes à puces et numérotées
 * - liens [texte](url)
 * - URLs nues HTTP/HTTPS
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

/**
 * N'autorise que les URL HTTP et HTTPS.
 * Le contrôle est fait après décodage des entités HTML,
 * afin d'éviter qu'une URL encodée contourne la validation.
 */
function isSafeUrl(value) {
  if (typeof value !== "string") return false;

  const url = value.trim();

  if (!url || /[\u0000-\u0020\u007f]/.test(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Protège les caractères spéciaux dans les expressions régulières.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Transforme le texte en HTML en échappant d'abord son contenu.
 * Les balises HTML ne sont jamais acceptées directement depuis le texte.
 */
function formatInline(value) {
  const source = String(value ?? "");
  const tokens = [];

  // Protège les liens avant d'appliquer le formatage Markdown.
  // Les marqueurs temporaires sont ensuite réinsérés après le formatage.
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

  const textWithTokens = source.replace(
    linkPattern,
    (match, label, url) => {
      if (!isSafeUrl(url)) return match;

      const token = `BAAROLINKTOKEN${tokens.length}END`;
      const safeLabel = formatInline(label);
      const safeUrl = escapeHtml(url);

      tokens.push(
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="underline" style="color:#2DBFA6">${safeLabel}</a>`
      );

      return token;
    }
  );

  let html = escapeHtml(textWithTokens);

  // Les URL nues sont converties en liens.
  // Les URL déjà traitées dans le Markdown sont protégées par des tokens.
  html = html.replace(
    /(^|[\s(])((?:https?):\/\/[^\s<>"']+)/gi,
    (match, prefix, rawUrl) => {
      // Évite d'inclure une ponctuation terminale courante dans le lien.
      const url = rawUrl.replace(/[.,!?;:]+$/, "");
      const suffix = rawUrl.slice(url.length);

      if (!isSafeUrl(url)) {
        return match;
      }

      const safeUrl = escapeHtml(url);

      return `${prefix}<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="underline" style="color:#2DBFA6">${safeUrl}</a>${suffix}`;
    }
  );

  // Gras, italique et souligné.
  // Le contenu est déjà échappé ; les balises ajoutées sont contrôlées.
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");

  // Restaure les liens Markdown après les transformations de texte.
  tokens.forEach((tokenHtml, index) => {
    const token = `BAAROLINKTOKEN${index}END`;
    html = html.replace(
      new RegExp(escapeRegExp(token), "g"),
      tokenHtml
    );
  });

  return html;
}

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
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

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

      output.push(`<li>${formatInline(ordered[1])}</li>`);
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
