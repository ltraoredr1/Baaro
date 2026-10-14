import { useRef, useCallback, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  List,
  ListOrdered,
  Sparkles,
  BarChart2,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { COLORS } from "../theme.js";

export function RichTextComposer({
  value = "",
  onChange,
  placeholder = "Partagez une perspective, une analyse ou une innovation avec le monde...",
  rows = 3,
  disabled = false,
  className = "",
  pollData,
  onPollChange,
}) {
  const textareaRef = useRef(null);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showPollEditor, setShowPollEditor] = useState(false);

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

  const wrapSelection = useCallback(
    (before, after = before) => {
      const el = textareaRef.current;
      if (!el || disabled) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = text.slice(start, end);
      const newText = text.slice(0, start) + before + selected + after + text.slice(end);
      updateText(newText);
      if (selected.length > 0) {
        restoreSelection(start + before.length, start + before.length + selected.length);
      } else {
        restoreSelection(start + before.length);
      }
    },
    [text, disabled, updateText, restoreSelection]
  );

  const handleBold = () => wrapSelection("**");
  const handleItalic = () => wrapSelection("*");
  const handleUnderline = () => wrapSelection("++");

  const handleLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el || disabled) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end) || "lien";
    const enteredUrl = window.prompt("Saisissez l'URL (http:// ou https://) :", "https://");
    if (!enteredUrl) return;
    const url = enteredUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      window.alert("L'URL doit commencer par http:// ou https://");
      return;
    }
    const markdown = `[${selected}](${url})`;
    updateText(text.slice(0, start) + markdown + text.slice(end));
  }, [text, disabled, updateText]);

  // ASSISTANT IA POUR LE COMPOSITEUR
  const handleAiAction = async (type) => {
    if (!text.trim() && type !== "generate") return;
    setAiLoading(true);
    setShowAiMenu(false);

    try {
      let result = text;

      if (type === "improve") {
        result = text.replace(/\b([a-z])/g, (c) => c.toUpperCase()); // Simulation / Remplacement optimisé
        result = `${text}\n\n*— Transmis avec clarté et précision.*`;
      } else if (type === "hashtags") {
        const words = text.split(" ").filter((w) => w.length > 4);
        const tags = words.slice(0, 3).map((w) => `#${w.replace(/[^a-zA-Z0-9]/g, "")}`).join(" ");
        result = `${text}\n\n${tags || "#BAARO #Innovation"}`;
      } else if (type === "summary") {
        result = `**Résumé exécutif :** ${text.slice(0, 100)}...`;
      }

      updateText(result);
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  // GESTION DU SONDAGE INTERACTIF
  const handleAddPollOption = () => {
    if (!onPollChange) return;
    const current = pollData || { question: "", options: ["", ""] };
    if (current.options.length < 4) {
      onPollChange({ ...current, options: [...current.options, ""] });
    }
  };

  const handleOptionTextChange = (index, val) => {
    if (!onPollChange) return;
    const current = pollData || { question: "", options: ["", ""] };
    const newOpts = [...current.options];
    newOpts[index] = val;
    onPollChange({ ...current, options: newOpts });
  };

  const handleQuestionChange = (val) => {
    if (!onPollChange) return;
    const current = pollData || { question: "", options: ["", ""] };
    onPollChange({ ...current, question: val });
  };

  const togglePoll = () => {
    if (showPollEditor) {
      setShowPollEditor(false);
      if (onPollChange) onPollChange(null);
    } else {
      setShowPollEditor(true);
      if (onPollChange) onPollChange({ question: "", options: ["", ""] });
    }
  };

  const btnClass = "p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-40";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* BARRE D'OUTILS PRINCIPALE */}
      <div
        className="flex items-center justify-between flex-wrap px-1.5 py-1 rounded-xl border"
        style={{ background: COLORS.surface, borderColor: COLORS.border }}
        role="toolbar"
      >
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={handleBold} disabled={disabled} className={btnClass} title="Gras">
            <Bold size={15} style={{ color: COLORS.ivory }} />
          </button>
          <button type="button" onClick={handleItalic} disabled={disabled} className={btnClass} title="Italique">
            <Italic size={15} style={{ color: COLORS.ivory }} />
          </button>
          <button type="button" onClick={handleUnderline} disabled={disabled} className={btnClass} title="Souligné">
            <Underline size={15} style={{ color: COLORS.ivory }} />
          </button>

          <div className="w-px h-4 mx-1 bg-white/10" />

          <button type="button" onClick={handleLink} disabled={disabled} className={btnClass} title="Insérer un lien">
            <LinkIcon size={15} style={{ color: COLORS.gold }} />
          </button>

          <div className="w-px h-4 mx-1 bg-white/10" />

          <button
            type="button"
            onClick={togglePoll}
            disabled={disabled}
            className={`${btnClass} ${showPollEditor ? "bg-amber-400/20" : ""}`}
            title="Créer un sondage"
          >
            <BarChart2 size={15} style={{ color: COLORS.teal }} />
          </button>
        </div>

        {/* BOUTON ASSISTANT IA */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAiMenu((v) => !v)}
            disabled={disabled || aiLoading}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all"
            style={{
              background: `${COLORS.gold}15`,
              borderColor: COLORS.borderGold,
              color: COLORS.gold,
            }}
          >
            <Sparkles size={13} />
            <span>{aiLoading ? "Optimisation..." : "Assistant IA"}</span>
          </button>

          {showAiMenu && (
            <div
              className="absolute right-0 top-8 z-30 min-w-[190px] rounded-xl border shadow-2xl py-1 text-xs"
              style={{ background: COLORS.surface, borderColor: COLORS.borderGold }}
            >
              <button
                type="button"
                onClick={() => handleAiAction("improve")}
                className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between"
                style={{ color: COLORS.ivory }}
              >
                <span>Optimiser le ton</span>
                <Sparkles size={12} style={{ color: COLORS.gold }} />
              </button>
              <button
                type="button"
                onClick={() => handleAiAction("hashtags")}
                className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between"
                style={{ color: COLORS.ivory }}
              >
                <span>Générer des Hashtags</span>
                <span className="text-[10px] text-teal-400">#</span>
              </button>
              <button
                type="button"
                onClick={() => handleAiAction("summary")}
                className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between"
                style={{ color: COLORS.ivory }}
              >
                <span>Format Résumé</span>
                <Check size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ZONE DE SAISIE */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => updateText(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed p-1"
        style={{ color: COLORS.ivory }}
      />

      {/* ÉDITEUR DE SONDAGE INTERACTIF */}
      {showPollEditor && pollData && (
        <div
          className="p-3 rounded-xl border flex flex-col gap-2 transition-all mt-1"
          style={{ background: COLORS.surface2, borderColor: COLORS.border }}
        >
          <div className="flex items-center justify-between text-xs font-semibold" style={{ color: COLORS.teal }}>
            <span className="flex items-center gap-1"><BarChart2 size={14} /> Sondage interactif</span>
            <button type="button" onClick={togglePoll} className="text-red-400 text-[11px] hover:underline">Annuler</button>
          </div>

          <input
            type="text"
            placeholder="Posez votre question..."
            value={pollData.question}
            onChange={(e) => handleQuestionChange(e.target.value)}
            className="w-full bg-black/20 border rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{ borderColor: COLORS.border, color: COLORS.ivory }}
          />

          <div className="flex flex-col gap-1.5">
            {pollData.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Choix ${idx + 1}`}
                  value={opt}
                  onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                  className="flex-1 bg-black/20 border rounded-lg px-2.5 py-1 text-xs outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                />
              </div>
            ))}
          </div>

          {pollData.options.length < 4 && (
            <button
              type="button"
              onClick={handleAddPollOption}
              className="text-[11px] flex items-center gap-1 hover:underline pt-1 self-start"
              style={{ color: COLORS.gold }}
            >
              <Plus size={12} /> Ajouter un choix
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default RichTextComposer;
