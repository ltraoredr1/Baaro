import {
  Rss,
  Play,
  MessageSquare,
  Swords,
  Coins,
  Wallet,
  WifiOff,
  Sparkles,
  Settings,
  Users,
  MoreHorizontal
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useState } from "react";

const NAV_ITEMS = [
  { id: "feed", label: "Fil", icon: Rss },
  { id: "friends", label: "Communauté", icon: Users },
  { id: "videos", label: "Vidéos", icon: Play },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "debates", label: "Débats", icon: Swords },
  { id: "crypto", label: "BARO", icon: Coins },
  { id: "wallet", label: "Portefeuille", icon: Wallet },
  { id: "offline", label: "Hors-ligne", icon: WifiOff },
  { id: "assistant", label: "IA", icon: Sparkles },
  { id: "settings", label: "Réglages", icon: Settings },
];

export function Navigation({ activeTab, setActiveTab }) {
  const [showMore, setShowMore] = useState(false);

  const mainItems = NAV_ITEMS.slice(0, 4); // Fil, Communauté, Vidéos, Messages
  const moreItems = NAV_ITEMS.slice(4);    // le reste

  return (
    <>
      {/* ========== DESKTOP ========== */}
      <nav
        className="hidden md:flex flex-col gap-1 p-3 glass-panel rounded-2xl border sticky top-24 shadow-xl"
        style={{ borderColor: COLORS.border }}
      >
        <div
          className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: COLORS.muted }}
        >
          Navigation
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive ? "gold-glow" : "hover:bg-white/5"
              }`}
              style={{
                background: isActive
                  ? "linear-gradient(135deg, rgba(217,174,82,0.2) 0%, rgba(45,191,166,0.1) 100%)"
                  : "transparent",
                color: isActive ? COLORS.gold : COLORS.ivory,
                border: isActive
                  ? `1px solid ${COLORS.borderGold}`
                  : "1px solid transparent",
              }}
            >
              <Icon
                size={18}
                style={{
                  color: isActive ? COLORS.gold : COLORS.muted,
                }}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ========== MOBILE BOTTOM BAR ========== */}
      <nav
        className="md:hidden fixed bottom-3 left-3 right-3 z-50 rounded-2xl border p-1.5 shadow-2xl flex items-center justify-around"
        style={{
          borderColor: COLORS.borderGold,
          background: "rgba(11, 18, 32, 0.95)",
        }}
      >
        {mainItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setShowMore(false);
              }}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition relative"
              style={{ color: isActive ? COLORS.gold : COLORS.muted }}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
              {isActive && (
                <span
                  className="absolute -bottom-1 w-4 h-1 rounded-full"
                  style={{ background: COLORS.gold }}
                />
              )}
            </button>
          );
        })}

        {/* Bouton Plus */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition relative"
          style={{
            color:
              showMore || moreItems.some((i) => i.id === activeTab)
                ? COLORS.gold
                : COLORS.muted,
          }}
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-medium leading-none">Plus</span>
        </button>
      </nav>

      {/* ========== MENU PLUS (MOBILE) ========== */}
      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-20 left-3 right-3 rounded-2xl p-4 border shadow-2xl"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.borderGold,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider mb-3 px-1"
              style={{ color: COLORS.muted }}
            >
              Plus d'options
            </p>

            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setShowMore(false);
                    }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl transition"
                    style={{
                      background: isActive
                        ? "rgba(217,174,82,0.15)"
                        : "rgba(255,255,255,0.05)",
                      color: isActive ? COLORS.gold : COLORS.ivory,
                      border: isActive
                        ? `1px solid ${COLORS.borderGold}`
                        : "1px solid transparent",
                    }}
                  >
                    <Icon size={22} />
                    <span className="text-[11px] font-medium text-center leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
