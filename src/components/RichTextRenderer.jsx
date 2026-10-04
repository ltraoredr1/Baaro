/**
 * Rendu léger du markdown BAARO (sans dépendance react-markdown).
 * Supporte : **gras**, *italique*, ++souligné++, listes simples, liens [txt](url), URLs nues.
 */
import { COLORS } from "../theme.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text) {
  let s = escapeHtml(text);
  // links [label](url)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline" style="color:#2DBFA6">$1</a>'
  );
  // bare urls
  s = s.replace(
    /(^|[\s])(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="underline" style="color:#2DBFA6">$2</a>'
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");
  return s;
}

function toHtml(content) {
  const lines = String(content || "").split("\n");
  const out = [];
  let listType = null; // ul | ol

  const closeList = () => {
    if (listType) {
      out.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }
  };

  for (const line of lines) {
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push('<ul class="list-disc list-inside mb-2 space-y-1">');
        listType = "ul";
      }
      out.push(`<li>${formatInline(ul[1])}</li>`);
      continue;
    }
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push('<ol class="list-decimal list-inside mb-2 space-y-1">');
        listType = "ol";
      }
      out.push(`<li>${formatInline(ol[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      out.push("<br/>");
    } else {
      out.push(`<p class="mb-2 last:mb-0 whitespace-pre-wrap">${formatInline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

export function RichTextRenderer({ content, className = "" }) {
  if (!content) return null;
  return (
    <div
      className={`rich-text text-sm leading-relaxed ${className}`}
      style={{ color: COLORS.ivory }}
      dangerouslySetInnerHTML={{ __html: toHtml(content) }}
    />
  );
}

export default RichTextRenderer;
