import { X, Crown } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { baaroLogo } from "../constants.js";

function formatXof(minor) {
  return `${(Number(minor || 0) / 100).toLocaleString("fr-FR")} FCFA`;
}

export default function TopGiftersSheet({ rows = [], onClose, days = 30 }) {
  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-xl max-h-[70dvh] bg-zinc-950 rounded-t-3xl border border-white/10 flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div>
            <h3 className="font-black flex items-center gap-2">
              <Crown size={16} style={{ color: COLORS.gold }} />
              Top donateurs
            </h3>
            <p className="text-[10px] text-white/40">
              {days ? `${days} derniers jours` : "Tout le temps"}
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {rows.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-10">
              Aucun cadeau pour le moment.
            </p>
          ) : (
            rows.map((row, i) => {
              const handle =
                row.handle?.replace(/^@/, "") || "membre";
              return (
                <div
                  key={row.sender_id}
                  className="flex items-center gap-3 rounded-2xl bg-white/[.04] border border-white/10 px-3 py-2.5"
                >
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black"
                    style={{
                      background: i < 3 ? COLORS.gold : "rgba(255,255,255,.1)",
                      color: i < 3 ? "#000" : "#fff",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="h-9 w-9 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                    <img
                      src={row.avatar_url || baaroLogo}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black truncate">@{handle}</div>
                    <div className="text-[10px] text-white/40">
                      {row.gift_count} cadeau(x)
                    </div>
                  </div>
                  <div className="text-xs font-black" style={{ color: COLORS.gold }}>
                    {formatXof(row.total_minor)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
