import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_FILTER_STATE,
  FILTER_NONE,
  FILTER_RANDOM,
  describeFilter,
  detectQuality,
  normalizeFilterState,
  randomSeed,
  resolveFilter,
} from "../filters/index.js";

// État du filtre vidéo (caméra, photos/texte, vidéo importée). Gardé en mémoire
// pour la session : un filtre oublié ne revient pas à la prochaine ouverture.
export function useVideoFilter() {
  const [state, setState] = useState(DEFAULT_FILTER_STATE);
  const quality = useMemo(() => detectQuality(), []);
  const spec = useMemo(() => resolveFilter(state, { quality }), [state, quality]);
  const info = useMemo(() => describeFilter(state), [state]);

  const patch = useCallback(
    (values) => setState((s) => normalizeFilterState({ ...s, ...values })),
    [],
  );
  const pick = useCallback(
    (id) => setState((s) => normalizeFilterState({ ...s, id, seed: 0 })),
    [],
  );
  const surprise = useCallback(
    () => setState((s) => normalizeFilterState({ ...s, id: FILTER_RANDOM, seed: randomSeed() })),
    [],
  );
  const step = useCallback(
    (delta) => setState((s) => normalizeFilterState({ ...s, seed: Math.max(0, s.seed + delta) })),
    [],
  );
  const reset = useCallback(() => setState(DEFAULT_FILTER_STATE), []);

  return { state, spec, info, active: state.id !== FILTER_NONE && !!spec, patch, pick, surprise, step, reset };
}
