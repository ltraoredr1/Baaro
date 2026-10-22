import { useState, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import { COLORS } from "@/theme.js";

const STORAGE_KEY = "baaro:fab-pos";
const SIZE = 56;
const MARGIN = 12;
const TOP_LIMIT = 90; // sous l'en-tête
const BOTTOM_LIMIT = 150; // au-dessus de la barre d'onglets
const DRAG_THRESHOLD = 6;

function readSavedPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if ((p.side === "left" || p.side === "right") && typeof p.y === "number") return p;
  } catch {
    /* stockage indisponible : position par défaut */
  }
  return null;
}

/**
 * Bouton flottant "Créer" :
 * - se déplace au doigt (glisser) et s'aimante au bord gauche ou droit
 * - un appui court ouvre la création de publication
 * - la position est mémorisée
 */
export function FloatingCreateButton({ onCreatePost }) {
  const [pos, setPos] = useState(() => readSavedPos() || { side: "right", y: null });
  const [drag, setDrag] = useState(null); // {x, y} pendant le glisser
  const startRef = useRef(null);

  const clampY = useCallback((y) => {
    const max = window.innerHeight - BOTTOM_LIMIT;
    return Math.min(Math.max(y, TOP_LIMIT), Math.max(TOP_LIMIT, max));
  }, []);

  // Position verticale par défaut : bas de l'écran, au-dessus de la barre d'onglets
  const baseY = pos.y == null ? clampY(window.innerHeight - BOTTOM_LIMIT) : clampY(pos.y);
  const left = drag
    ? drag.x
    : pos.side === "left"
      ? MARGIN
      : window.innerWidth - SIZE - MARGIN;
  const top = drag ? drag.y : baseY;

  const onPointerDown = (e) => {
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
      x: Math.min(Math.max(s.left + dx, 0), window.innerWidth - SIZE),
      y: Math.min(Math.max(s.top + dy, 0), window.innerHeight - SIZE),
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

    // Aimantation au bord le plus proche
    const centerX = (drag?.x ?? s.left) + SIZE / 2;
    const next = {
      side: centerX < window.innerWidth / 2 ? "left" : "right",
      y: clampY(drag?.y ?? s.top),
    };
    setPos(next);
    setDrag(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignoré */
    }
  };

  return (
    <div
      className="fixed z-40"
      style={{
        left,
        top,
        width: SIZE,
        height: SIZE,
        transition: drag ? "none" : "left 0.28s cubic-bezier(.3,1.4,.5,1), top 0.2s ease",
      }}
    >
      <style>{`
        @keyframes baaro-fab-ring {
          0%   { box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,.55); }
          70%  { box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 14px rgba(212,175,55,0); }
          100% { box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,0); }
        }
        .baaro-fab-idle { animation: baaro-fab-ring 3.6s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .baaro-fab-idle { animation: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label="Créer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startRef.current = null;
          setDrag(null);
        }}
        className={`${drag ? "" : "baaro-fab-idle"} w-full h-full rounded-full flex items-center justify-center select-none`}
        style={{
          touchAction: "none",
          background: `linear-gradient(135deg, ${COLORS.gold}, ${COLORS.teal})`,
          color: "#000",
          boxShadow: "0 6px 18px rgba(0,0,0,.45)",
          transform: drag ? "scale(1.12)" : "none",
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
