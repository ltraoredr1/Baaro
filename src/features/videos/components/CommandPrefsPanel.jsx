import { useEffect, useState } from "react";
import { X, RotateCcw, Sparkles } from "lucide-react";
import { COLORS } from "../../../theme.js";
import {
  loadCommandPrefs,
  saveCommandPrefs,
  resetCommandPrefs,
  ACTION_LABELS,
  GESTURE_LABELS,
} from "../lib/commandPreferences.js";

const ACTIONS = Object.keys(ACTION_LABELS);

export default function CommandPrefsPanel({ open, onClose, onSaved }) {
  const [prefs, setPrefs] = useState(loadCommandPrefs);

  useEffect(() => {
    if (open) setPrefs(loadCommandPrefs());
  }, [open]);

  if (!open) return null;

  const updateGesture = (gesture, action) => {
    setPrefs((p) => ({
      ...p,
      gestureMap: { ...p.gestureMap, [gesture]: action },
    }));
  };

  const save = () => {
    saveCommandPrefs(prefs);
    onSaved?.(prefs);
    onClose?.();
  };

  const reset = () => {
    const d = resetCommandPrefs();
    setPrefs(d);
    onSaved?.(d);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950/95 p-4 backdrop-blur">
          <div>
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black"
              style={{ background: `${COLORS.gold}22`, color: COLORS.gold }}
            >
              <Sparkles size={12} /> BAARO Command Hub
            </div>
            <h3 className="mt-1 text-lg font-black">Personnaliser les commandes</h3>
            <p className="text-[11px] text-white/45">
              Gestes, voix et feedback — unique à BAARO
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <section>
            <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-white/50">
              Mapping des gestes
            </h4>
            <div className="space-y-2">
              {Object.keys(GESTURE_LABELS).map((g) => (
                <div
                  key={g}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5"
                >
                  <span className="text-sm font-bold">{GESTURE_LABELS[g]}</span>
                  <select
                    value={prefs.gestureMap[g] || "none"}
                    onChange={(e) => updateGesture(g, e.target.value)}
                    className="rounded-xl border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs font-bold outline-none"
                  >
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <h4 className="text-xs font-black uppercase tracking-wide text-white/50">
              Options
            </h4>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Feedback sonore sur geste</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.soundOnGesture}
                onClick={() =>
                  setPrefs((p) => ({ ...p, soundOnGesture: !p.soundOnGesture }))
                }
                className={`relative h-6 w-11 rounded-full transition ${
                  prefs.soundOnGesture ? "bg-yellow-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    prefs.soundOnGesture ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Activer la voix au démarrage</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.voiceEnabledByDefault}
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    voiceEnabledByDefault: !p.voiceEnabledByDefault,
                  }))
                }
                className={`relative h-6 w-11 rounded-full transition ${
                  prefs.voiceEnabledByDefault ? "bg-yellow-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    prefs.voiceEnabledByDefault ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Activer les gestes au démarrage</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.cameraEnabledByDefault}
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    cameraEnabledByDefault: !p.cameraEnabledByDefault,
                  }))
                }
                className={`relative h-6 w-11 rounded-full transition ${
                  prefs.cameraEnabledByDefault ? "bg-yellow-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    prefs.cameraEnabledByDefault ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>
          </section>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-bold"
            >
              <RotateCcw size={16} /> Réinitialiser
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-[2] rounded-2xl py-3 text-sm font-black"
              style={{ background: COLORS.gold, color: "#000" }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
