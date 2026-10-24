import { useState, useRef, useCallback, useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { COLORS as C } from "../../../theme.js";

const STORAGE_KEY = "baaro:story-fab-pos";
const SIZE = 56;
const MARGIN = 16;
const TOP_LIMIT = 100;
// Plus haut que la barre d'onglets + marge pour ne pas coller aux cartes en bas
const BOTTOM_LIMIT = 200;
const DRAG_THRESHOLD = 6;

function readSavedPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if ((p.side === "left" || p.side === "right") && typeof p.y === "number") {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Bouton flottant "Créer une story"
 * - Indépendant du bouton publication
 * - Déplaçable (ne reste plus collé aux stories au scroll)
 * - Position mémorisée
 */
export function CreateFab({ isOpen, onToggle }) {
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

  // Position par défaut : coin bas-droit, au-dessus de la nav, sans coller aux cartes
  const defaultY = clampY(viewport.h - BOTTOM_LIMIT - 8);
  const baseY = pos.y == null ? defaultY : clampY(pos.y);

  const left = drag
    ? drag.x
    : pos.side === "left"
      ? MARGIN
      : viewport.w - SIZE - MARGIN;
  const top = drag ? drag.y : baseY;

  const onPointerDown = (e) => {
    // Empêche le scroll de la page pendant le drag
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

    // Tap court = ouvrir / fermer le compositeur
    if (!s.moved) {
      onToggle?.();
      return;
    }

    // Aimantation au bord le plus proche
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
      className="fixed z-[55] pointer-events-none"
      style={{
        left,
        top,
        width: isOpen ? "auto" : SIZE,
        height: SIZE,
        // Le conteneur ne bloque pas le scroll des stories
        marginBottom: "env(safe-area-inset-bottom, 0px)",
        transition: drag
          ? "none"
          : "left 0.28s cubic-bezier(.3,1.4,.5,1), top 0.2s ease, width 0.2s ease",
      }}
    >
      <style>{`
        @keyframes baaro-story-fab-pulse {
          0%   { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,.5); }
          70%  { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 14px rgba(212,175,55,0); }
          100% { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 0 rgba(212,175,55,0); }
        }
        .baaro-story-fab-idle {
          animation: baaro-story-fab-pulse 2.6s ease-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .baaro-story-fab-idle { animation: none; }
        }
      `}</style>

      <button
        type="button"
        aria-label={isOpen ? "Fermer le compositeur de story" : "Créer une story"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startRef.current = null;
          setDrag(null);
        }}
        className={`
          pointer-events-auto
          ${drag || isOpen ? "" : "baaro-story-fab-idle"}
          h-full rounded-full flex items-center justify-center gap-2
          select-none font-bold text-sm shadow-2xl
          ${isOpen ? "px-5" : "w-full"}
        `}
        style={{
          touchAction: "none", // important : ne pas bloquer le scroll de la page autour
          background: isOpen
            ? "linear-gradient(135deg, #1a1a1a, #333)"
            : `linear-gradient(135deg, ${C.gold || "#d4af37"}, ${C.teal || "#14b8a6"})`,
          color: isOpen ? "#fff" : "#000",
          boxShadow: "0 10px 28px rgba(0,0,0,.5)",
          border: isOpen ? "1px solid rgba(255,255,255,.12)" : "none",
          transform: drag ? "scale(1.08)" : "none",
          transition: "transform 0.2s ease, background 0.25s ease",
          cursor: drag ? "grabbing" : "grab",
          minWidth: SIZE,
        }}
      >
        {isOpen ? (
          <>
            <X size={20} strokeWidth={2.6} />
            <span className="pr-1">Fermer</span>
          </>
        ) : (
          <Sparkles size={22} strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}

export default CreateFab;
