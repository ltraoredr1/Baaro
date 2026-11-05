import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { COLORS } from "@/theme.js";

const LABELS = { post: "Post", story: "Story", video: "Vidéo" };

export default function CreateHub({ open, onClose, panels = {}, initialTab = "post" }) {
  const keys = Object.keys(panels).filter((k) => panels[k]);
  const [tab, setTab] = useState(initialTab);
  if (!open || keys.length === 0) return null;
  const active = keys.includes(tab) ? tab : keys[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
        style={{ borderColor: COLORS.borderGold, background: COLORS.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b p-4 text-xs font-semibold shrink-0"
          style={{ borderColor: COLORS.border, color: COLORS.gold }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} />
            <span>Créer</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {keys.length > 1 && (
          <div className="flex gap-1 p-2 shrink-0">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                style={active === k ? { background: COLORS.gold, color: "#000" } : { color: COLORS.muted }}
              >
                {LABELS[k] || k}
              </button>
            ))}
          </div>
        )}

        {panels[active]}
      </div>
    </div>
  );
}
