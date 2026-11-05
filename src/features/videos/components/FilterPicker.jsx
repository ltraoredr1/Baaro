import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, SlidersHorizontal } from "lucide-react";
import { COLORS } from "../../../theme.js";
import {
  FILTER_CATEGORIES,
  FILTER_NONE,
  FILTER_RANDOM,
  presetsByCategory,
} from "../filters/index.js";

const INFINITE = "infinite";

const MIXER = [
  ["hue", "Teinte", -180, 180, 1, (v) => `${v > 0 ? "+" : ""}${Math.round(v)}°`],
  ["density", "Densité des effets", 0, 2.5, 0.05, (v) => `${Math.round(v * 100)}%`],
  ["brightness", "Luminosité", -0.5, 0.5, 0.01, (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`],
  ["contrast", "Contraste", -0.5, 0.5, 0.01, (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`],
  ["saturation", "Saturation", -0.5, 0.5, 0.01, (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`],
];

const swatch = (sw) => `linear-gradient(160deg, ${sw[0]}, ${sw[1]})`;

function Chip({ active, disabled, onClick, sw, emoji, label }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className="flex w-[60px] shrink-0 flex-col items-center gap-1 disabled:opacity-40"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl"
        style={{
          background: swatch(sw),
          outline: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
          outlineOffset: 2,
        }}
      >
        {emoji}
      </span>
      <span className={`w-full truncate text-center text-[10px] ${active ? "font-black text-white" : "text-white/55"}`}>
        {label}
      </span>
    </button>
  );
}

// Sélecteur de filtres : catégories, filtres, variantes infinies et réglages.
// filter = retour de useVideoFilter().
export default function FilterPicker({ filter, disabled = false, className = "" }) {
  const { state, info, active, pick, patch, surprise, step, reset } = filter;
  const initialTab =
    state.id === FILTER_RANDOM
      ? INFINITE
      : FILTER_CATEGORIES.find((c) => presetsByCategory(c.id).some((p) => p.id === state.id))?.id || "ocean";
  const [tab, setTab] = useState(initialTab);
  const [mixer, setMixer] = useState(false);

  const tabs = [{ id: INFINITE, emoji: "∞", label: "Infini" }, ...FILTER_CATEGORIES];

  return (
    <div className={`space-y-3 text-white ${className}`}>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Catégories de filtres">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
              tab === t.id ? "bg-white text-black" : "bg-white/10 text-white/70"
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {tab === INFINITE ? (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || !active}
              onClick={() => step(-1)}
              aria-label="Filtre précédent"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-black">
                {state.id === FILTER_RANDOM ? info.label : "Génère un filtre unique"}
              </div>
              {state.id === FILTER_RANDOM && (
                <div className="text-[10px] text-white/45">Filtre n° {state.seed}</div>
              )}
            </div>
            <button
              type="button"
              disabled={disabled || !active}
              onClick={() => step(1)}
              aria-label="Filtre suivant"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={surprise}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            <Shuffle size={16} /> Surprends-moi
          </button>
          <p className="text-center text-[10px] text-white/40">
            Chaque numéro est un filtre différent : couleurs, effets et ambiance. Fais défiler avec ◀ ▶.
          </p>
        </div>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <Chip
            active={state.id === FILTER_NONE}
            disabled={disabled}
            onClick={reset}
            sw={["#3f3f46", "#18181b"]}
            emoji="🚫"
            label="Aucun"
          />
          {presetsByCategory(tab).map((p) => (
            <Chip
              key={p.id}
              active={state.id === p.id}
              disabled={disabled}
              onClick={() => pick(p.id)}
              sw={p.sw}
              emoji={p.emoji}
              label={p.label}
            />
          ))}
        </div>
      )}

      {active && (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">
              {info.emoji} {info.label}
            </span>
            <div className="flex gap-1.5">
              {state.id !== FILTER_RANDOM && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => step(1)}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold disabled:opacity-40"
                >
                  Variante {state.seed + 1}
                </button>
              )}
              <button
                type="button"
                aria-label="Réglages"
                aria-pressed={mixer}
                onClick={() => setMixer((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-full ${mixer ? "bg-yellow-400 text-black" : "bg-white/10"}`}
              >
                <SlidersHorizontal size={14} />
              </button>
              <button
                type="button"
                aria-label="Retirer le filtre"
                disabled={disabled}
                onClick={reset}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 disabled:opacity-40"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          <label className="block text-[11px] text-white/60">
            <span className="flex justify-between">
              Intensité <span>{Math.round(state.intensity * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={state.intensity}
              disabled={disabled}
              onChange={(e) => patch({ intensity: Number(e.target.value) })}
              className="w-full accent-yellow-400"
            />
          </label>

          {mixer &&
            MIXER.map(([key, label, min, max, stepSize, fmt]) => (
              <label key={key} className="block text-[11px] text-white/60">
                <span className="flex justify-between">
                  {label} <span>{fmt(state[key])}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={stepSize}
                  value={state[key]}
                  disabled={disabled}
                  onChange={(e) => patch({ [key]: Number(e.target.value) })}
                  className="w-full accent-yellow-400"
                />
              </label>
            ))}
        </div>
      )}
    </div>
  );
}
