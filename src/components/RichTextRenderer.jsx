
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
  const raw = String(value ?? "").trim();

  if (!raw || /[\u0000-\u0020\u007f]/.test(raw)) return null;

  try {
    const url = new URL(raw);

    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function formatInline(value) {
  const tokens = [];
  const prefix = "BAARO_SAFE_TOKEN_";

  const protect = (html) => {
    const token = `${prefix}${tokens.length}_END`;
    tokens.push(html);
    return token;
  };

  let text = String(value ?? "");

  // Protéger le code en ligne avant toute autre transformation.
  text = text.replace(/`([^`\n]+)`/g, (_, code) =>
    protect(
      `<code class="rounded px-1 py-0.5 text-xs font-mono whitespace-pre-wrap" style="background:rgba(255,255,255,.08);color:#D9AE52">${escapeHtml(code)}</code>`
    )
  );

  // Traiter les liens Markdown en n'autorisant que HTTP et HTTPS.
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (match, label, rawUrl) => {
      const url = safeUrl(rawUrl);
      if (!url) return escapeHtml(match);

      return protect(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" class="underline font-semibold break-words" style="color:#2DBFA6">${escapeHtml(label)}</a>`
      );
    }
  );

  // Échapper tout le texte restant avant de créer des balises.
  text = escapeHtml(text);

  // Rendre les URL nues cliquables sans inclure la ponctuation finale.
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
    const match = rawUrl.match(/[.,!?;:)\]]+$/);
    const suffix = match ? match[0] : "";
    const candidate = suffix ? rawUrl.slice(0, -suffix.length) : rawUrl;
    const url = safeUrl(candidate);

    if (!url) return rawUrl;

    return (
      protect(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" class="underline font-semibold break-words" style="color:#2DBFA6">${escapeHtml(candidate)}</a>`
      ) + suffix
    );
  });

  // Gras, italique, barré et souligné.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  text = text.replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  // Restaurer les fragments HTML produits par le renderer lui-même.
  tokens.forEach((html, index) => {
    text = text.split(`${prefix}${index}_END`).join(html);
  });

  return text;
}

function isTableDivider(line) {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|");

  return (
    cells.length > 0 &&
    cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
  );
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines) {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);

  const head = header
    .map(
      (cell) =>
        `<th scope="col" class="px-3 py-2 text-left font-semibold border-b border-white/10">${formatInline(cell)}</th>`
    )
    .join("");

  const body = rows
    .map(
      (row) =>
        `<tr>${header
          .map(
            (_, index) =>
              `<td class="px-3 py-2 align-top border-b border-white/5">${formatInline(row[index] ?? "")}</td>`
          )
          .join("")}</tr>`
    )
    .join("");

  return `<div class="my-3 max-w-full overflow-x-auto rounded-lg border border-white/10"><table class="w-full border-collapse text-left text-xs sm:text-sm"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function toHtml(content) {
  const lines = String(content ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];

  let listType = null;
  let paragraph = [];
  let codeLines = null;

  const closeList = () => {
    if (!listType) return;

    output.push(listType === "ol" ? "</ol>" : "</ul>");
    listType = null;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;

    output.push(
      `<p class="mb-2 whitespace-pre-wrap leading-relaxed break-words">${paragraph
        .map((line) => formatInline(line))
        .join("<br />")}</p>`
    );

    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*`{3}([\w+-]*)\s*$/);

    if (codeLines) {
      if (fence) {
        output.push(
          `<div class="my-3 overflow-hidden rounded-lg border border-white/10"><div class="bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-wide opacity-70">${escapeHtml(codeLines.language || "code")}</div><pre class="max-w-full overflow-x-auto p-3 text-xs leading-relaxed" style="background:rgba(0,0,0,.18)"><code>${escapeHtml(codeLines.lines.join("\n"))}</code></pre></div>`
        );

        codeLines = null;
      } else {
        codeLines.lines.push(line);
      }

      continue;
    }

    if (fence) {
      flushParagraph();
      closeList();
      codeLines = { language: fence[1] || "", lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    // Tableau Markdown.
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1])
    ) {
      flushParagraph();
      closeList();

      const tableLines = [line, lines[index + 1]];
      index += 2;

      while (
        index < lines.length &&
        lines[index].trim() &&
        lines[index].includes("|")
      ) {
        tableLines.push(lines[index]);
        index += 1;
      }

      index -= 1;
      output.push(renderTable(tableLines));
      continue;
    }

    // Titres Markdown de niveau 1 à 6.
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

    if (heading) {
      flushParagraph();
      closeList();

      const level = heading[1].length;
      const sizeClass =
        level <= 2
          ? "text-base font-bold"
          : level === 3
            ? "text-sm font-bold"
            : "text-sm font-semibold";

      output.push(
        `<h${level} class="mb-2 mt-3 ${sizeClass} leading-snug">${formatInline(heading[2])}</h${level}>`
      );
      continue;
    }

    // Séparateurs.
    if (/^\s{0,3}(---+|___+|\*\s*\*\s*\*+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      output.push('<hr class="my-3 border-white/15" />');
      continue;
    }

    // Citations.
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);

    if (quote) {
      flushParagraph();
      closeList();

      output.push(
        `<blockquote class="my-2 rounded-r border-l-2 py-1 pl-3 italic" style="border-color:#D9AE52;background:rgba(217,174,82,.06)">${formatInline(quote[1])}</blockquote>`
      );
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const task = unordered?.[1]?.match(/^\[([ xX])\]\s+(.+)$/);

    if (unordered || ordered) {
      flushParagraph();

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

      if (task) {
        const checked = task[1].toLowerCase() === "x";

        output.push(
          `<li class="list-none"><span aria-label="${checked ? "Terminé" : "À faire"}" class="mr-2">${checked ? "☑" : "☐"}</span>${formatInline(task[2])}</li>`
        );
      } else {
        output.push(
          `<li class="break-words">${formatInline((unordered || ordered)[1])}</li>`
        );
      }

      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();

  // Conserver le code si la réponse finit sans clôture de bloc.
  if (codeLines) {
    output.push(
      `<pre class="my-3 max-w-full overflow-x-auto rounded-lg p-3 text-xs" style="background:rgba(0,0,0,.18)"><code>${escapeHtml(codeLines.lines.join("\n"))}</code></pre>`
    );
  }

  return output.join("");
}

export function RichTextRenderer({ content, className = "" }) {
  if (content == null || content === "") return null;

  return (
    <div
      className={`rich-text min-w-0 max-w-full text-sm leading-relaxed [overflow-wrap:anywhere] ${className}`}
      style={{ color: COLORS.ivory }}
      dangerouslySetInnerHTML={{ __html: toHtml(content) }}
    />
  );
}

export default RichTextRenderer;
