import { X } from "lucide-react";
import { COLORS } from "../../../theme.js";

function formatXof(minor) {
  const n = Number(minor || 0) / 100;
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

/**
 * Grille de cadeaux pendant la lecture.
 */
export default function GiftPicker({
  catalog = [],
  onSend,
  onClose,
  busyCode = null,
  videoTitle,
}) {
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-xl bg-zinc-950 rounded-t-3xl border border-white/10 p-4 pb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-black text-lg">Offrir un cadeau</h3>
            <p className="text-[11px] text-white/40 truncate max-w-[240px]">
              {videoTitle || "Soutiens le créateur"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {catalog.map((gift) => {
            const busy = busyCode === gift.code;
            return (
              <button
                key={gift.code}
                type="button"
                disabled={!!busyCode}
                onClick={() => onSend(gift)}
                className="rounded-2xl border border-white/10 bg-white/[.04] p-3 active:scale-95 transition disabled:opacity-50"
              >
                <div className="text-3xl mb-1">{gift.emoji || "🎁"}</div>
                <div className="text-xs font-black text-white">{gift.name}</div>
                <div
                  className="text-[10px] font-bold mt-1"
                  style={{ color: COLORS.gold }}
                >
                  {busy ? "…" : formatXof(gift.price_minor)}
                </div>
              </button>
            );
          })}
        </div>

        {!catalog.length && (
          <p className="text-center text-sm text-white/40 py-8">
            Catalogue cadeaux indisponible.
          </p>
        )}

        <p className="mt-4 text-[10px] text-white/35 text-center leading-relaxed">
          Paiement sécurisé côté serveur. Les BAARO Credits ne sont pas utilisés
          pour les cadeaux en monnaie.
        </p>
      </div>
    </div>
  );
}

/** Animation flottante après envoi */
export function GiftFlyingOverlay({ gift }) {
  if (!gift) return null;
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center">
      <div className="animate-bounce text-7xl drop-shadow-2xl">
        {gift.emoji || "🎁"}
      </div>
      <div className="absolute bottom-1/3 text-center">
        <div className="text-sm font-black text-white/90 bg-black/50 px-3 py-1 rounded-full">
          {gift.name}
        </div>
      </div>
    </div>
  );
}
