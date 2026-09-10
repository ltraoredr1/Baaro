import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS } from "../theme.js";

/**
 * Rendu professionnel et sécurisé des publications.
 * Supporte Markdown (gras, italique, listes, liens) + souligné via ++texte++
 * Auto-lien des URLs et des liens de groupes Baaro.
 */
export function RichTextRenderer({ content, className = "" }) {
  if (!content) return null;

  // Convertit la syntaxe souligné ++texte++ en <u>
  const withUnderline = content.replace(/\+\+([^\n]+?)\+\+/g, "<u>$1</u>");

  return (
    <div
      className={`rich-text text-sm leading-relaxed ${className}`}
      style={{ color: COLORS.ivory }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold" style={{ color: COLORS.ivory }}>
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          u: ({ children }) => <u className="underline">{children}</u>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => {
            const isBaaroGroup =
              href &&
              (href.includes("/g/") ||
                href.includes("baaro.app/g") ||
                href.includes("baaro-xi.vercel.app/g") ||
                href.startsWith("/g/") ||
                href.startsWith("?group="));

            const isInternal = href?.startsWith("/") || href?.startsWith("?");

            return (
              <a
                href={href}
                target={isInternal ? undefined : "_blank"}
                rel={isInternal ? undefined : "noopener noreferrer"}
                className="underline underline-offset-2 hover:opacity-90 transition-opacity"
                style={{
                  color: isBaaroGroup ? COLORS.teal : COLORS.gold,
                }}
              >
                {children}
              </a>
            );
          },
          code: ({ children }) => (
            <code
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ background: COLORS.surface2, color: COLORS.goldLight }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              className="p-3 rounded-xl overflow-x-auto text-xs mb-2"
              style={{ background: COLORS.surface2 }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="border-l-4 pl-3 my-2 italic"
              style={{ borderColor: COLORS.gold, color: COLORS.mutedLight }}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {withUnderline}
      </ReactMarkdown>
    </div>
  );
}
