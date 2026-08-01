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
  Users // ← AJOUT
} from "lucide-react";
import { COLORS } from "../theme.js";

const NAV_ITEMS = [
  { id: "feed", label: "Fil", icon: Rss, badge: null },
  { id: "friends", label: "Communauté", icon: Users, badge: null }, // ← AJOUT
  { id: "videos", label: "Vidéos", icon: Play, badge: "HOT" },
  { id: "messages", label: "Messages", icon: MessageSquare, badge: "3" },
  { id: "debates", label: "Débats", icon: Swords, badge: null },
  { id: "crypto", label: "BARO Coin", icon: Coins, badge: "PRO" },
  { id: "wallet", label: "Portefeuille", icon: Wallet, badge: null },
  { id: "offline", label: "Hors-ligne", icon: WifiOff, badge: "P2P" },
  { id: "assistant", label: "IA Assistant", icon: Sparkles, badge: null },
  { id: "settings", label: "Réglages", icon: Settings, badge: null },
];

export function Navigation({ activeTab, setActiveTab }) {
  return (
    <>
      {/* Desktop / Tablet Sidebar & Top bar navigation */}
      <nav className="hidden md:flex flex-col gap-1 p-3 glass-panel rounded-2xl border sticky top-24 shadow-xl" style={{ borderColor: COLORS.border }}>
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.muted }}>
          Navigation Principale
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                isActive ? "shadow-md gold-glow" : "hover:bg-[rgba(255,255,255,0.05)]"
              }`}
              style={{
                background: isActive
                  ? "linear-gradient(135deg, rgba(217,174,82,0.2) 0%, rgba(45,191,166,0.1) 100%)"
                  : "transparent",
                color: isActive ? COLORS.gold : COLORS.ivory,
                border: isActive ? `1px solid ${COLORS.borderGold}` : "1px solid transparent",
              }}
            >
              <div className="flex items-center gap-3">
                <Icon
                  size={18}
                  style={{
                    color: isActive ? COLORS.gold : COLORS.muted,
                    filter: isActive ? "drop-shadow(0 0 6px rgba(217,174,82,0.5))" : "none",
                  }}
                  className="transition-transform group-hover:scale-110"
                />
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase"
                  style={{
                    background: item.badge === "PRO" ? COLORS.purple : item.badge === "P2P" ? COLORS.teal : COLORS.gold,
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

      {/* Mobile Floating Bottom Bar */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 z-50 glass-panel rounded-2xl border p-1.5 shadow-2xl flex items-center justify-around" style={{ borderColor: COLORS.borderGold, background: "rgba(11, 18, 32, 0.92)" }}>
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition relative"
              style={{
                color: isActive ? COLORS.gold : COLORS.muted,
              }}
            >
              <Icon size={20} style={{ color: isActive ? COLORS.gold : COLORS.muted }} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
              {isActive && (
                <span className="absolute -bottom-1 w-4 h-1 rounded-full" style={{ background: COLORS.gold }} />
              )}
            </button>
          );
        })}
        <button
          onClick={() => setActiveTab(activeTab === "settings" ? "feed" : "settings")}
          className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition"
          style={{ color: activeTab === "settings" || activeTab === "wallet" || activeTab === "offline" || activeTab === "assistant" ? COLORS.teal : COLORS.muted }}
        >
          <Settings size={20} />
          <span className="text-[10px] font-medium leading-none">Plus</span>
        </button>
      </nav>
    </>
  );
}
