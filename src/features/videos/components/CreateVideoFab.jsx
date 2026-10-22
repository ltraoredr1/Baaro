import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { COLORS } from "../../../theme.js";

const SIZE = 60;
const MARGIN = 10;
const TOP_LIMIT = 72;
const BOTTOM_LIMIT = 24;
const DRAG_THRESHOLD = 6;
const STORAGE_KEY = "baaro:video-fab-position";

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      (parsed?.side === "left" || parsed?.side === "right") &&
      typeof parsed.yRatio === "number"
    ) {
      return parsed;
    }
  } catch {
    // stockage indisponible
  }
  return null;
}

function save(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // stockage indisponible
  }
}

// Bouton flottant « Créer une vidéo » : déplaçable au doigt, se colle au bord le plus proche
// et mémorise sa position.
export default function CreateVideoFab({ onClick, hidden = false }) {
  const btnRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);

  const getBounds = () => {
    const parent = btnRef.current?.parentElement;
    const rect = parent?.getBoundingClientRect();
    return {
      w: rect?.width || window.innerWidth,
      h: rect?.height || window.innerHeight,
    };
  };

  const clampX = (x, b) =>
    Math.min(b.w - SIZE - MARGIN, Math.max(MARGIN, x));

  const clampY = (y, b) =>
    Math.min(b.h - SIZE - BOTTOM_LIMIT, Math.max(TOP_LIMIT, y));

  // Position initiale, et recalcul quand l'écran change de taille.
  useEffect(() => {
    if (hidden) return undefined;

    const place = () => {
      const b = getBounds();
      const saved = readSaved() || { side: "left", yRatio: 0.45 };

      setPos({
        x: saved.side === "right" ? b.w - SIZE - MARGIN : MARGIN,
        y: clampY(saved.yRatio * b.h, b),
      });
    };

    place();
    window.addEventListener("resize", place);

    return () => window.removeEventListener("resize", place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  const handlePointerDown = (e) => {
    if (!pos) return;
    e.stopPropagation();

    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture non supportée
    }
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    e.stopPropagation();

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
    }

    const b = getBounds();

    setPos({
      x: clampX(drag.originX + dx, b),
      y: clampY(drag.originY + dy, b),
    });
  };

  const handlePointerEnd = (e) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    e.stopPropagation();

    drag.active = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // déjà relâché
    }

    if (!drag.moved) {
      // Simple appui : ouvrir la création.
      onClick?.();
      return;
    }

    // Fin du déplacement : on se colle au bord le plus proche et on mémorise.
    setDragging(false);

    const b = getBounds();
    const current = pos || { x: MARGIN, y: TOP_LIMIT };
    const side = current.x + SIZE / 2 > b.w / 2 ? "right" : "left";
    const y = clampY(current.y, b);

    setPos({
      x: side === "right" ? b.w - SIZE - MARGIN : MARGIN,
      y,
    });

    save({ side, yRatio: y / b.h });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  if (hidden) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Créer une vidéo"
      title="Créer une vidéo (glisse pour déplacer)"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-0 z-[65] select-none outline-none"
      style={{
        width: SIZE,
        height: SIZE,
        touchAction: "none",
        visibility: pos ? "visible" : "hidden",
        transform: `translate3d(${pos?.x ?? 0}px, ${pos?.y ?? 0}px, 0) scale(${
          dragging ? 1.12 : 1
        })`,
        transition: dragging
          ? "none"
          : "transform 280ms cubic-bezier(0.2, 0.9, 0.3, 1.2)",
      }}
    >
      {/* Halo qui pulse pour attirer l'œil (coupé pendant le glisser) */}
      {!dragging && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-40"
          style={{ background: COLORS.gold }}
        />
      )}

      <span
        className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-white/70 text-black active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${COLORS.gold}, #ff8a00)`,
          boxShadow: dragging
            ? "0 16px 36px rgba(0,0,0,0.55), 0 0 0 6px rgba(255,200,0,0.25)"
            : "0 8px 22px rgba(0,0,0,0.5), 0 0 18px rgba(255,190,0,0.55)",
        }}
      >
        <Plus size={30} strokeWidth={3.5} />
      </span>

      <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-black text-white backdrop-blur-md">
        {dragging ? "Dépose-moi" : "Créer"}
      </span>
    </button>
  );
}
