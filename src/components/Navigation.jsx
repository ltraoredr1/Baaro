import { useState } from "react";
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
  Store,
  X,
} from "lucide-react";
import { COLORS } from "../theme.js";

const MAIN_ITEMS = [
  { id: "feed", label: "Fil", icon: Rss, badge: null },
  { id: "videos", label: "Vidéos", icon: Play, badge: "HOT" },
  { id: "messages", label: "Chat", icon: MessageSquare, badge: "3" },
  { id: "debates", label: "Débats", icon: Swords, badge: null },
  { id: "crypto", label: "BARO", icon: Coins, badge: "PRO" },
];

const MORE_ITEMS = [
  { id: "friends", label: "Communauté", icon: Users, badge: null },
  { id: "shop", label: "Boutiques", icon: Store, badge: null },
  { id: "wallet", label: "Portefeuille", icon: Wallet, badge: null },
  { id: "offline", label: "Hors-ligne", icon: WifiOff, badge: "P2P" },
  { id: "assistant", label: "IA Assistant", icon: Sparkles, badge: null },
  { id: "settings", label: "Réglages", icon: Settings, badge: null },
];

const ALL_ITEMS = [...MAIN_ITEMS, ...MORE_ITEMS];

export function Navigation({ activeTab, setActiveTab }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const goTo = (id) => {
    setActiveTab(id);
    setMoreOpen(false);
  };

  const isMoreActive = MORE_ITEMS.some((i) => i.id === activeTab);

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <nav
        className="hidden md:flex flex-col gap-1 p-3 glass-panel rounded-2xl border sticky top-24 shadow-xl"
        style={{ borderColor: COLORS.border }}
      >
        <div
          className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: COLORS.muted }}
        >
          Navigation Principale
        </div>
        {ALL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                isActive ? "shadow-md gold-glow" : "hover:bg-[rgba(255,255,255,0.05)]"
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
              <div className="flex items-center gap-3">
                <Icon
                  size={18}
                  style={{
                    color: isActive ? COLORS.gold : COLORS.muted,
                    filter: isActive
                      ? "drop-shadow(0 0 6px rgba(217,174,82,0.5))"
                      : "none",
                  }}
                  className="transition-transform group-hover:scale-110"
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase"
                  style={{
                    background:
                      item.badge === "PRO"
                        ? COLORS.purple
                        : item.badge === "P2P"
                        ? COLORS.teal
                        : COLORS.gold,
                    color: COLORS.bg,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Menu Plus (mobile) */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="rounded-t-3xl border-t p-4 pb-8"
            style={{
              background: COLORS.surface || "#111A2C",
              borderColor: COLORS.borderGold,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-bold text-sm"
                style={{ color: COLORS.ivory }}
              >
                Plus
              </h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full"
                style={{ color: COLORS.muted }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition"
                    style={{
                      background: isActive
                        ? "rgba(217,174,82,0.15)"
                        : "rgba(255,255,255,0.03)",
                      borderColor: isActive
                        ? COLORS.borderGold
                        : COLORS.border,
                      color: isActive ? COLORS.gold : COLORS.ivory,
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

      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-3 left-3 right-3 z-50 glass-panel rounded-2xl border p-1.5 shadow-2xl flex items-center justify-around"
        style={{
          borderColor: COLORS.borderGold,
          background: "rgba(11, 18, 32, 0.92)",
        }}
      >
        {MAIN_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition relative"
              style={{ color: isActive ? COLORS.gold : COLORS.muted }}
            >
              <Icon
                size={20}
                style={{ color: isActive ? COLORS.gold : COLORS.muted }}
              />
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
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition relative"
          style={{ color: isMoreActive || moreOpen ? COLORS.teal : COLORS.muted }}
        >
          <Settings size={20} />
          <span className="text-[10px] font-medium leading-none">Plus</span>
          {(isMoreActive || moreOpen) && (
            <span
              className="absolute -bottom-1 w-4 h-1 rounded-full"
              style={{ background: COLORS.teal }}
            />
          )}
        </button>
      </nav>
    </>
  );
}
