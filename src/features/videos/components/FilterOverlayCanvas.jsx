import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion.js";
import { drawOverlays } from "../filters/index.js";

// Calque animé posé sur une vidéo/photo pour prévisualiser un filtre
// (particules, voile, vignette). Le rendu final est fait à l'enregistrement.
export default function FilterOverlayCanvas({ spec, className = "" }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!spec || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const draw = (ms) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawOverlays(ctx, canvas.width, canvas.height, spec, ms, { blend: false });
    };
    if (reduced) {
      draw(4000);
      return undefined;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function loop(now) {
      draw(now - t0);
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [spec, reduced]);

  if (!spec) return null;
  return (
    <canvas
      ref={ref}
      width={360}
      height={640}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
