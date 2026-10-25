import { useState, useEffect, useRef } from "react";
import { Bot, X } from "lucide-react";
import { COLORS } from "../theme.js";
// ⚠️ Ajuste ce chemin vers ton vrai dossier (ex: ../features/ai/AiAssistantTab.jsx)
import AiAssistantTab from "../features/ai/AiAssistantTab.jsx";

const FAB_SIZE = 56;
const EDGE = 8;
const TOP_RESERVE = 64; // ne pas passer sous l'en-tête
const DRAG_THRESHOLD = 6; // px : en dessous, c'est un simple appui
const STORAGE_KEY = "baaro:ai_fab_pos";

function getBounds() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // En dessous de 1024px, la barre de navigation du bas occupe ~88px
  const bottomReserve = w < 1024 ? 88 : EDGE;
  return {
    minX: EDGE,
    maxX: Math.max(EDGE, w - FAB_SIZE - EDGE),
    minY: TOP_RESERVE,
    maxY: Math.max(TOP_RESERVE, h - FAB_SIZE - bottomReserve),
  };
}

function clampPos(p) {
  const b = getBounds();
  return {
    x: Math.min(b.maxX, Math.max(b.minX, p.x)),
    y: Math.min(b.maxY, Math.max(b.minY, p.y)),
  };
}

function loadPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return clampPos(p);
  } catch { /* ignore */ }
  return null;
}

function savePos(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
}

/**
 * Bouton flottant + panneau IA, visible sur toutes les pages.
 * À monter UNE SEULE FOIS dans MainShell.
 * Le bouton est déplaçable (glisser au doigt ou à la souris) et se colle au bord
 * gauche ou droit le plus proche ; sa position est mémorisée.
 *
 * Props :
 *  - userProfile
 *  - onPublishAction(text) : optionnel
 *  - hidden : true sur l'onglet IA pour éviter le doublon
 */
export default function FloatingAiAssistant({
  userProfile,
  onPublishAction,
  hidden = false,
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [pos, setPos] = useState(loadPos); // null = position par défaut (CSS)
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const justDraggedRef = useRef(false);

  // Écoute des boutons "Demander à l'IA" placés sur les posts
  useEffect(() => {
    const onAsk = (e) => {
      const text = e.detail?.text;
      if (!text) return;
      setPrefill({
        text: `À propos de ce texte :\n"${text}"\n\n`,
        key: Date.now(),
      });
      setOpen(true);
    };
    window.addEventListener("baaro:ask-ai", onAsk);
    return () => window.removeEventListener("baaro:ask-ai", onAsk);
  }, []);

  // Fermer avec Échap
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Garder le bouton dans l'écran si la fenêtre change (rotation, clavier…)
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ox: rect.left,
      oy: rect.top,
      moved: false,
      last: { x: rect.left, y: rect.top },
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    d.last = clampPos({ x: d.ox + dx, y: d.oy + dy });
    setPos(d.last);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.moved) return;
    setDragging(false);
    // Anti-clic fantôme juste après un glissement
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 80);
    // Se coller au bord gauche ou droit le plus proche
    const b = getBounds();
    const snapped = {
      x: d.last.x + FAB_SIZE / 2 < window.innerWidth / 2 ? b.minX : b.maxX,
      y: d.last.y,
    };
    setPos(snapped);
    savePos(snapped);
  };

  const onFabClick = () => {
    if (justDraggedRef.current) return;
    setOpen(true);
  };

  if (hidden) return null;

  return (
    <>
      {/* Le panneau reste monté (juste caché) pour garder la conversation */}
      <div
        className={`fixed z-[1001] flex flex-col rounded-2xl border shadow-2xl
          inset-x-2 bottom-20 top-16
          sm:inset-x-auto sm:right-5 sm:w-[400px] sm:top-auto sm:h-[620px]
          ${open ? "" : "hidden"}`}
        style={{
          background: COLORS.bg || "#0b0b0b",
          borderColor: COLORS.borderGold,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 text-white"
          aria-label="Fermer l'assistant"
        >
          <X size={16} />
        </button>
        <div className="flex-1 overflow-y-auto p-3 pt-10">
          <AiAssistantTab
            userProfile={userProfile}
            onPublishAction={onPublishAction}
            prefill={prefill}
          />
        </div>
      </div>

      {/* Bouton flottant déplaçable */}
      {!open && (
        <button
          type="button"
          onClick={onFabClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`fixed z-[1000] w-14 h-14 rounded-full flex items-center justify-center shadow-xl touch-none select-none ${
            pos ? "" : "right-4 bottom-20 sm:bottom-6"
          } ${dragging ? "cursor-grabbing scale-105" : "cursor-grab active:scale-95"}`}
          style={{
            background: COLORS.gold,
            color: "#000",
            ...(pos ? { left: pos.x, top: pos.y } : {}),
            transition: dragging ? "none" : "left 0.2s ease, top 0.2s ease, transform 0.15s ease",
          }}
          aria-label="Ouvrir l'assistant IA (glisser pour déplacer)"
        >
          <Bot size={26} />
        </button>
      )}
    </>
  );
}
