import { useEffect, useRef, useCallback } from "react";

/**
 * Recharge les données quand :
 * - l'onglet navigateur redevient visible
 * - la fenêtre reprend le focus
 * - l'utilisateur revient sur un onglet app (optionnel via `active`)
 *
 * Usage :
 *   usePageRefresh(loadPosts, { active: true, minIntervalMs: 8000 });
 */
export function usePageRefresh(reloadFn, options = {}) {
  const {
    active = true,
    minIntervalMs = 10_000,
    onMount = false,
  } = options;

  const fnRef = useRef(reloadFn);
  const lastRef = useRef(0);

  useEffect(() => {
    fnRef.current = reloadFn;
  }, [reloadFn]);

  const run = useCallback(() => {
    if (!active || typeof fnRef.current !== "function") return;
    const now = Date.now();
    if (now - lastRef.current < minIntervalMs) return;
    lastRef.current = now;
    try {
      fnRef.current();
    } catch (e) {
      console.warn("[usePageRefresh]", e);
    }
  }, [active, minIntervalMs]);

  useEffect(() => {
    if (!active) return;

    if (onMount) run();

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const onFocus = () => run();
    const onPageShow = (e) => {
      if (e.persisted) run();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [active, run, onMount]);
}

export default usePageRefresh;
