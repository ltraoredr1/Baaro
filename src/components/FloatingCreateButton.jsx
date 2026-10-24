import { useState, useRef, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import { COLORS } from "@/theme.js";

const STORAGE_KEY = "baaro:fab-pos";
const SIZE = 56;
const MARGIN = 16;
const TOP_LIMIT = 100;
// Assez haut pour ne pas coller à la barre d'onglets ni aux derniers posts
const BOTTOM_LIMIT = 200;
const DRAG_THRESHOLD = 6;

function readSavedPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if ((p.side === "left" || p.side === "right") && typeof p.y === "number") return p;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Bouton flottant "Créer une publication"
 * - Déplaçable, aimanté gauche/droite
 * - Ne bloque plus le scroll ni les clics sur les posts
 * - Position mémorisée
 */
export function FloatingCreateButton({ onCreatePost }) {
  const [pos, setPos] = useState(() => readSavedPos() || { side: "right", y: null });
  const [drag, setDrag] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 390,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const startRef = useRef(null);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clampY = useCallback(
    (y) => {
      const max = viewport.h - BOTTOM_LIMIT;
      return Math.min(Math.max(y, TOP_LIMIT), Math.max(TOP_LIMIT, max));
    },
    [viewport.h]
  );

  const defaultY = clampY(viewport.h - BOTTOM_LIMIT - 8);
  const baseY = pos.y == null ? defaultY : clampY(pos.y);

  const left = drag
    ? drag.x
    : pos.side === "left"
      ? MARGIN
      : viewport.w - SIZE - MARGIN;
  const top = drag ? drag.y : baseY;

  const onPointerDown = (e) => {
    e.preventDefault();
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      left,
      top,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    s.moved = true;
    setDrag({
      x: Math.min(Math.max(s.left + dx, 0), viewport.w - SIZE),
      y: Math.min(Math.max(s.top + dy, 0), viewport.h - SIZE),
    });
  };

  const onPointerUp = (e) => {
    const s = startRef.current;
    startRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!s) return;

    if (!s.moved) {
      onCreatePost?.();
      return;
    }

    const centerX = (drag?.x ?? s.left) + SIZE / 2;
    const next = {
      side: centerX < viewport.w / 2 ? "left" : "right",
      y: clampY(drag?.y ?? s.top),
    };
    setPos(next);
    setDrag(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed z-[60] pointer-events-none"
      style={{
        left,
        top,
        width: SIZE,
        height: SIZE,
        marginBottom: "env(safe-area-inset-bottom, 0px)",
        transition: drag
          ? "none"
          : "left 0.28s cubic-bezier(.3,1.4,.5,1), top 0.2s ease",
      }}
    >
      <style>{`
        @keyframes baaro-fab-pulse {
          0%   { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,.5); }
          70%  { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 14px rgba(212,175,55,0); }
          100% { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,0); }
        }
        .baaro-fab-idle {
          animation: baaro-fab-pulse 2.6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .baaro-fab-idle { animation: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label="Créer une publication"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startRef.current = null;
          setDrag(null);
        }}
        className={`${drag ? "" : "baaro-fab-idle"} pointer-events-auto w-full h-full rounded-full flex items-center justify-center select-none`}
        style={{
          touchAction: "none",
          background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.teal})`,
          color: "#000",
          boxShadow: "0 10px 28px rgba(0,0,0,.5)",
          transform: drag ? "scale(1.08)" : "none",
          transition: "transform 0.2s ease",
          cursor: drag ? "grabbing" : "grab",
        }}
      >
        <Plus size={28} strokeWidth={2.8} />
      </button>
    </div>
  );
}

export default FloatingCreateButton;
