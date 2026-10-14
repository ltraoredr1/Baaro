/**
 * Rendu léger du Markdown BAARO, sans dépendance react-markdown.
 *
 * Formats pris en charge :
 * - **gras**
 * - *italique*
 * - ++souligné++
 * - Mentions @pseudo (sans doublons @@)
 * - Hashtags #tendance
 * - Extrait de code `code`
 * - Citations > texte
 * - Listes à puces et numérotées
 * - Liens [texte](url)
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
  let source = String(value ?? "");

  // 0. Nettoyage des doublons d'arobases (ex: @@pseudo -> @pseudo)
  source = source.replace(/@@+/g, "@");

  const tokens = [];

  // 1. Protège les liens Markdown avant les autres transformations.
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

  let html = source.replace(
    markdownLinkPattern,
    (match, label, url) => {
      if (!isSafeUrl(url)) return match;

      const token = `BAAROMARKDOWNLINK${tokens.length}TOKEN`;

      tokens.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline font-semibold hover:opacity-80 transition-opacity" style="color:#2DBFA6">${escapeHtml(label)}</a>`
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
      const url = rawUrl.replace(/[.,!?;:]+$/, "");
      const suffix = rawUrl.slice(url.length);

      if (!isSafeUrl(url)) {
        return match;
      }

      const safeUrl = escapeHtml(url);

      return (
        `${prefix}<a href="${safeUrl}" ` +
        'target="_blank" rel="noopener noreferrer" ' +
        'class="underline font-semibold hover:opacity-80 transition-opacity" style="color:#2DBFA6">' +
        `${safeUrl}</a>${suffix}`
      );
    }
  );

  // 4. Applique les mises en forme Markdown standards
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong className='font-bold' style='color:#F5F3EF'>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em className='italic'>$1</em>");
  html = html.replace(/\+\+([^+\n]+)\+\+/g, "<u className='underline decoration-amber-400/50'>$1</u>");

  // 5. Code en ligne `code`
  html = html.replace(/`([^`\n]+)`/g, "<code className='px-1.5 py-0.5 rounded text-xs font-mono border' style='background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.1); color:#D9AE52'>$1</code>");

  // 6. Mentions @pseudo et Hashtags #tendance
  html = html.replace(/(^|[\s(])@([a-zA-Z0-9_]+)/g, "$1<span className='font-bold cursor-pointer hover:underline' style='color:#D9AE52'>@$2</span>");
  html = html.replace(/(^|[\s(])#([a-zA-Z0-9_]+)/g, "$1<span className='font-semibold cursor-pointer hover:underline' style='color:#2DBFA6'>#$2</span>");

  // 7. Restaure les liens Markdown protégés.
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
 * Convertit le texte en paragraphes, citations et listes HTML.
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
    const quote = line.match(/^\s*&gt;\s+(.+)$/) || line.match(/^\s*>\s+(.+)$/);

    if (quote) {
      closeList();
      output.push(
        `<blockquote class="border-l-2 pl-3 my-1 italic text-xs py-1 rounded-r opacity-90" style="border-color:#D9AE52; background:rgba(217,174,82,0.05); color:#F5F3EF">${formatInline(quote[1])}</blockquote>`
      );
      continue;
    }

    if (unordered) {
      if (listType !== "ul") {
        closeList();
        output.push('<ul class="list-disc list-inside mb-2 space-y-1 pl-1">');
        listType = "ul";
      }
      output.push(`<li>${formatInline(unordered[1])}</li>`);
      continue;
    }

    if (ordered) {
      if (listType !== "ol") {
        closeList();
        output.push('<ol class="list-decimal list-inside mb-2 space-y-1 pl-1">');
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
      `<p class="mb-2 last:mb-0 whitespace-pre-wrap leading-relaxed">${formatInline(line)}</p>`
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
