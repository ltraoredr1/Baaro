import { useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { COLORS } from "../theme.js";
import { TRANSLATE_LANGS, translateMedia } from "../lib/translateApi.js";
import { useToast } from "./ToastContext.jsx";

export function ImageTranslateControls({ mediaUrl }) {
  const { showToast } = useToast();
  const [language, setLanguage] = useState("fr");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!mediaUrl || loading) return;
    setLoading(true);
    try {
      const data = await translateMedia({
        mediaUrl,
        targetLang: language,
        mode: "subtitles",
      });

      if (data?.mediaType !== "image" || !data.translatedText) {
        throw new Error("La traduction de cette image est indisponible.");
      }

      setResult(data);
    } catch (error) {
      showToast(error.message || "Traduction de l'image impossible", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border p-3 space-y-2"
      style={{
        background: "rgba(12, 15, 20, 0.94)",
        borderColor: COLORS.border,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Languages size={17} style={{ color: COLORS.teal }} />
        <span className="text-xs font-semibold text-white">Traduire l'image</span>
        <div className="flex-1" />
        {result && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className="text-white/70 p-1"
            aria-label="Fermer la traduction"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!result ? (
        <div className="flex gap-2">
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={loading}
            className="min-w-0 flex-1 rounded-lg px-2 py-2 text-xs bg-white/10 text-white border border-white/20"
          >
            {TRANSLATE_LANGS.map((item) => (
              <option key={item.code} value={item.code} className="text-black">
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50"
            style={{ background: COLORS.teal, color: "#071014" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Traduire"}
          </button>
        </div>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-2 text-xs">
          {result.extractedText && (
            <div>
              <p className="text-white/50 mb-1">Texte détecté</p>
              <p className="text-white/80 whitespace-pre-wrap">{result.extractedText}</p>
            </div>
          )}
          <div>
            <p className="mb-1" style={{ color: COLORS.teal }}>Traduction</p>
            <p className="text-white whitespace-pre-wrap">{result.translatedText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
