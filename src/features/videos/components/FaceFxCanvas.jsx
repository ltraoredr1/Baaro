import { useEffect, useRef } from "react";
import { FaceFxProcessor } from "../faceFx/processor.js";

// Calque d'aperçu : redessine la vidéo avec les déformations. Posé au-dessus de la
// <video> (pointer-events: none), il laisse la vidéo visible tant que le suivi n'est pas prêt.
export default function FaceFxCanvas({ videoRef, fx, mirror = false, fit = "contain", maxSide = 720, cssFilter = "none" }) {
  const canvasRef = useRef(null);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const enabled = !!fx?.active;

  useEffect(() => {
    if (!enabled) return undefined;
    const processor = new FaceFxProcessor();
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const resolved = fxRef.current?.resolved;
      if (canvas && video && video.readyState >= 2 && video.videoWidth) {
        const r = processor.process(video, video.videoWidth, video.videoHeight, resolved, { maxSide });
        const ctx = canvas.getContext("2d");
        if (r.source === video) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else {
          if (canvas.width !== r.w || canvas.height !== r.h) {
            canvas.width = r.w;
            canvas.height = r.h;
          }
          ctx.drawImage(r.source, 0, 0);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      processor.dispose();
    };
  }, [enabled, videoRef, maxSide]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ objectFit: fit, transform: mirror ? "scaleX(-1)" : "none", filter: cssFilter }}
    />
  );
}
