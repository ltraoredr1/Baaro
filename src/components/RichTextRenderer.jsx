
import { COLORS } from "../theme.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return ["https:", "http:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !/[\u0000-\u0020\u007f]/.test(String(value))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function formatInline(value) {
  const tokens = [];
  const protect = (html) => {
    const token = `BAAROTOKEN${tokens.length}END`;
    tokens.push(html);
    return token;
  };

  let text = String(value ?? "").replace(/@@+/g, "@");

  // Protéger le code avant les autres transformations.
  text = text.replace(/`([^`\n]+)`/g, (_, code) =>
    protect(
      `<code class="rounded px-1 py-0.5 text-xs font-mono" style="background:rgba(255,255,255,.08);color:#D9AE52">${escapeHtml(code)}</code>`
    )
  );

  // Liens Markdown : seuls HTTP et HTTPS sont autorisés.
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gi, (match, label, rawUrl) => {
    const url = safeUrl(rawUrl);
    if (!url) return escapeHtml(match);

    return protect(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline font-semibold" style="color:#2DBFA6">${escapeHtml(label)}</a>`
    );
  });

  // Échapper le texte utilisateur avant de créer les autres balises.
  text = escapeHtml(text);

  // URL nues. La ponctuation finale reste hors du lien.
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
    const match = rawUrl.match(/[.,!?;:)]+$/);
    const suffix = match ? match[0] : "";
    const candidate = suffix ? rawUrl.slice(0, -suffix.length) : rawUrl;
    const url = safeUrl(candidate);

    if (!url) return rawUrl;

    return protect(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline font-semibold" style="color:#2DBFA6">${escapeHtml(candidate)}</a>`
    ) + suffix;
  });

  // Mise en forme textuelle.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  text = text.replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  text = text.replace(/(^|[\s(])@([a-zA-Z0-9_]{1,40})/g,
    '$1<span class="font-bold" style="color:#D9AE52">@$2</span>');
  text = text.replace(/(^|[\s(])#([a-zA-Z0-9_]{1,80})/g,
    '$1<span class="font-semibold" style="color:#2DBFA6">#$2</span>');

  // Restaurer les fragments HTML préalablement sécurisés.
  tokens.forEach((html, index) => {
    text = text.replaceAll(`BAAROTOKEN${index}END`, html);
  });

  return text;
}

function toHtml(content) {
  const output = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    output.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  };

  for (const line of String(content ?? "").split(/\r?\n/)) {
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const quote = line.match(/^\s*&gt;\s+(.+)$/) ||
      line.match(/^\s*>\s+(.+)$/);

    if (quote) {
      closeList();
      output.push(
        `<blockquote class="my-2 rounded-r border-l-2 py-1 pl-3 italic" style="border-color:#D9AE52;background:rgba(217,174,82,.06)">${formatInline(quote[1])}</blockquote>`
      );
      continue;
    }

    if (unordered || ordered) {
      const type = unordered ? "ul" : "ol";
      if (listType !== type) {
        closeList();
        output.push(
          type === "ul"
            ? '<ul class="mb-2 list-disc list-inside space-y-1">'
            : '<ol class="mb-2 list-decimal list-inside space-y-1">'
        );
        listType = type;
      }
      output.push(`<li>${formatInline((unordered || ordered)[1])}</li>`);
      continue;
    }

    closeList();

    if (!line.trim()) {
      output.push('<div class="h-2" aria-hidden="true"></div>');
    } else {
      output.push(
        `<p class="mb-2 whitespace-pre-wrap leading-relaxed">${formatInline(line)}</p>`
      );
    }
  }

  closeList();
  return output.join("");
}

export function RichTextRenderer({ content, className = "" }) {
  if (content == null || content === "") return null;

  return (
    <div
      className={`rich-text text-sm leading-relaxed ${className}`}
      style={{ color: COLORS.ivory }}
      dangerouslySetInnerHTML={{ __html: toHtml(content) }}
    />
  );
}

export default RichTextRenderer;
