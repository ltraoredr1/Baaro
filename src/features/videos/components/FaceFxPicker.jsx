import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, SlidersHorizontal } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { FACE_FX_CATEGORIES, FACE_PARAMS, BODY_PARAMS, SKIN_PARAMS, FX_NONE, FX_RANDOM, faceFxByCategory } from "../faceFx/presets.js";
import { MASK_CATEGORIES, MASK_NONE, MASK_RANDOM, masksByCategory } from "../faceFx/masks.js";
import { ensureTracker, subscribeTracker } from "../faceFx/tracker.js";

const INFINITE = "infinite";
const swatch = (sw) => `linear-gradient(160deg, ${sw[0]}, ${sw[1]})`;

function Chip({ active, disabled, onClick, sw, emoji, label }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className="flex w-[60px] shrink-0 flex-col items-center gap-1 disabled:opacity-40">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl" style={{ background: swatch(sw), outline: active ? `2px solid ${COLORS.gold}` : "2px solid transparent", outlineOffset: 2 }}>
        {emoji}
      </span>
      <span className={`w-full truncate text-center text-[10px] ${active ? "font-black text-white" : "text-white/55"}`}>{label}</span>
    </button>
  );
}

const GROUPS = [
  ["Visage", FACE_PARAMS],
  ["Corps", BODY_PARAMS],
  ["Peau & âge", SKIN_PARAMS],
];

// Sélecteur de déformations : âge, visage, corps, délire + variantes infinies.
// fx = retour de useFaceFx().
export default function FaceFxPicker({ fx, disabled = false }) {
  const { state, resolved, info, active, pick, surprise, step, patch, setParam, reset, setMask, maskSurprise, maskStep, setMaskHue, clearMask, maskInfo } = fx;
  const maskIds = new Set(MASK_CATEGORIES.map((c) => c.id));
  const isMaskTab = (t) => maskIds.has(t);
  const hasMask = state.mask.id !== MASK_NONE;
  const hasWarp = resolved.hasWarp;
  const [tab, setTab] = useState(state.id === FX_RANDOM ? INFINITE : "age");
  const [mixer, setMixer] = useState(false);
  const [tracker, setTracker] = useState({ status: { face: "idle", pose: "idle" }, error: {} });

  useEffect(() => subscribeTracker(setTracker), []);
  useEffect(() => {
    if (active) ensureTracker({ pose: resolved.needsPose });
  }, [active, resolved.needsPose]);

  const tabs = [{ id: INFINITE, emoji: "∞", label: "Infini" }, ...MASK_CATEGORIES, ...FACE_FX_CATEGORIES];
  const value = (id) => {
    const base = resolved.params[id] ?? (id === "age" ? resolved.age : id === "smooth" ? resolved.smooth : 0);
    return state.adjust[id] ?? base / (state.intensity || 1);
  };

  const err = tracker.error.face || (resolved.needsPose ? tracker.error.pose : "");
  const loading = active && (tracker.status.face === "loading" || (resolved.needsPose && tracker.status.pose === "loading"));

  return (
    <div className="space-y-3 text-white">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Catégories de déformations">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${tab === t.id ? "bg-white text-black" : "bg-white/10 text-white/70"}`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {tab === INFINITE ? (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3">
          <div className="flex items-center gap-2">
            <button type="button" disabled={disabled || state.id !== FX_RANDOM} onClick={() => step(-1)} aria-label="Mutation précédente" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-sm font-black">{state.id === FX_RANDOM ? info.label : "Génère une mutation unique"}</div>
            </div>
            <button type="button" disabled={disabled || state.id !== FX_RANDOM} onClick={() => step(1)} aria-label="Mutation suivante" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
              <ChevronRight size={18} />
            </button>
          </div>
          <button type="button" disabled={disabled} onClick={surprise} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black disabled:opacity-40" style={{ background: COLORS.gold, color: "#000" }}>
            <Shuffle size={16} /> Mute-moi
          </button>
          <p className="text-center text-[10px] text-white/40">Chaque numéro combine yeux, nez, bouche, mâchoire… différemment. Fais défiler avec ◀ ▶.</p>
          <div className="flex items-center gap-2 pt-2">
            <button type="button" disabled={disabled || state.mask.id !== MASK_RANDOM} onClick={() => maskStep(-1)} aria-label="Animal précédent" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 flex-1 text-center text-sm font-black">
              {state.mask.id === MASK_RANDOM && maskInfo ? `${maskInfo.emoji} ${maskInfo.label}` : "Animal & accessoire au hasard"}
            </div>
            <button type="button" disabled={disabled || state.mask.id !== MASK_RANDOM} onClick={() => maskStep(1)} aria-label="Animal suivant" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
              <ChevronRight size={18} />
            </button>
          </div>
          <button type="button" disabled={disabled} onClick={maskSurprise} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-black disabled:opacity-40">
            🐾 Animal surprise
          </button>
        </div>
      ) : isMaskTab(tab) ? (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <Chip active={!hasMask} disabled={disabled} onClick={clearMask} sw={["#3f3f46", "#18181b"]} emoji="🚫" label="Aucun" />
          {masksByCategory(tab).map((p) => (
            <Chip key={p.id} active={state.mask.id === p.id} disabled={disabled} onClick={() => setMask(p.id)} sw={p.sw} emoji={p.emoji} label={p.label} />
          ))}
        </div>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <Chip active={state.id === FX_NONE} disabled={disabled} onClick={reset} sw={["#3f3f46", "#18181b"]} emoji="🚫" label="Aucun" />
          {faceFxByCategory(tab).map((p) => (
            <Chip key={p.id} active={state.id === p.id} disabled={disabled} onClick={() => pick(p.id)} sw={p.sw} emoji={p.emoji} label={p.label} />
          ))}
        </div>
      )}

      {loading && <p className="rounded-xl bg-white/[0.06] px-3 py-2 text-center text-[11px] text-white/70">Chargement du suivi du visage…</p>}
      {active && err && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
          Suivi indisponible : {err}. Voir public/models/README.md.
        </p>
      )}
      {active && !err && !loading && tracker.status.face === "ready" && (
        <p className="text-center text-[10px] text-white/40">
          {resolved.needsPose ? "Place-toi en entier dans le cadre pour les effets corps." : "Le visage doit être face caméra et bien éclairé."}
        </p>
      )}

      {hasMask && (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">{maskInfo?.emoji} {maskInfo?.label}</span>
            <button type="button" aria-label="Retirer l'animal" disabled={disabled} onClick={clearMask} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
              <RotateCcw size={14} />
            </button>
          </div>
          {state.mask.id !== MASK_RANDOM && (
            <label className="block text-[11px] text-white/60">
              <span className="flex justify-between">Couleur <span>{Math.round(state.mask.hue)}°</span></span>
              <input type="range" min={-180} max={180} step={1} value={state.mask.hue} disabled={disabled} onChange={(e) => setMaskHue(Number(e.target.value))} className="w-full accent-yellow-400" />
            </label>
          )}
        </div>
      )}

      {hasWarp && (
        <div className="space-y-2 rounded-2xl bg-white/[0.06] p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">{info.emoji} {info.label}</span>
            <div className="flex gap-1.5">
              <button type="button" aria-label="Réglages" aria-pressed={mixer} onClick={() => setMixer((v) => !v)} className={`flex h-7 w-7 items-center justify-center rounded-full ${mixer ? "bg-yellow-400 text-black" : "bg-white/10"}`}>
                <SlidersHorizontal size={14} />
              </button>
              <button type="button" aria-label="Retirer l'effet" disabled={disabled} onClick={reset} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 disabled:opacity-40">
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          <label className="block text-[11px] text-white/60">
            <span className="flex justify-between">Intensité <span>{Math.round(state.intensity * 100)}%</span></span>
            <input type="range" min={0} max={1.5} step={0.01} value={state.intensity} disabled={disabled} onChange={(e) => patch({ intensity: Number(e.target.value) })} className="w-full accent-yellow-400" />
          </label>
          {mixer &&
            GROUPS.map(([title, list]) => (
              <div key={title} className="space-y-1.5">
                <div className="pt-1 text-[10px] font-black uppercase tracking-wide text-white/40">{title}</div>
                {list.map((p) => (
                  <label key={p.id} className="block text-[11px] text-white/60">
                    <span className="flex justify-between">{p.label} <span>{Math.round(value(p.id) * 100)}</span></span>
                    <input type="range" min={p.min ?? -1} max={1} step={0.01} value={value(p.id)} disabled={disabled} onChange={(e) => setParam(p.id, Number(e.target.value))} className="w-full accent-yellow-400" />
                  </label>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

