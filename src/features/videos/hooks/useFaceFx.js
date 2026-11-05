import { useCallback, useMemo, useState } from "react";
import { DEFAULT_FX_STATE, normalizeFxState, resolveFaceFx } from "../faceFx/operators.js";
import { describeMask, MASK_NONE, MASK_RANDOM } from "../faceFx/masks.js";
import { describeFaceFx, FX_RANDOM } from "../faceFx/presets.js";
import { randomSeed } from "../filters/index.js";

// État des déformations visage / corps / âge (en mémoire pour la session).
export function useFaceFx() {
  const [state, setState] = useState(DEFAULT_FX_STATE);
  const resolved = useMemo(() => resolveFaceFx(state), [state]);
  const info = useMemo(() => describeFaceFx(state), [state]);

  const set = useCallback((fn) => setState((s) => normalizeFxState(fn(s))), []);
  const pick = useCallback((id) => set((s) => ({ ...s, id, seed: 0, adjust: {} })), [set]);
  const surprise = useCallback(
    () => set((s) => ({ ...s, id: FX_RANDOM, seed: randomSeed(), adjust: {} })),
    [set],
  );
  const step = useCallback(
    (delta) => set((s) => ({ ...s, id: FX_RANDOM, seed: Math.max(1, (s.seed || 0) + delta), adjust: {} })),
    [set],
  );
  const patch = useCallback((values) => set((s) => ({ ...s, ...values })), [set]);
  const setParam = useCallback(
    (key, value) => set((s) => ({ ...s, adjust: { ...s.adjust, [key]: value } })),
    [set],
  );
  const resetParams = useCallback(() => set((s) => ({ ...s, adjust: {} })), [set]);
  const setMask = useCallback((id) => set((s) => ({ ...s, mask: { ...s.mask, id, seed: 0 } })), [set]);
  const maskSurprise = useCallback(
    () => set((s) => ({ ...s, mask: { id: MASK_RANDOM, seed: randomSeed(), hue: 0 } })),
    [set],
  );
  const maskStep = useCallback(
    (delta) => set((s) => ({ ...s, mask: { id: MASK_RANDOM, seed: Math.max(1, (s.mask.seed || 0) + delta), hue: 0 } })),
    [set],
  );
  const setMaskHue = useCallback((hue) => set((s) => ({ ...s, mask: { ...s.mask, hue } })), [set]);
  const clearMask = useCallback(() => set((s) => ({ ...s, mask: { id: MASK_NONE, seed: 0, hue: 0 } })), [set]);
  const reset = useCallback(() => setState(DEFAULT_FX_STATE), []);
  const maskInfo = useMemo(() => describeMask(state.mask), [state.mask]);

  return {
    state,
    resolved,
    info,
    active: resolved.active,
    pick,
    surprise,
    step,
    patch,
    setMask,
    maskSurprise,
    maskStep,
    setMaskHue,
    clearMask,
    maskInfo,
    setParam,
    resetParams,
    reset,
  };
}
