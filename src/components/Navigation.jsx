import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Home,
  Video,
  MessageSquare,
  Wallet,
  Users,
  TrendingUp,
  WifiOff,
  Sparkles,
  Settings,
  Building2,
  Coins,
  Compass,
  X,
  Menu,
} from "lucide-react";
import { useApp } from "../contexts/AppContext.jsx";
import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderGold: "rgba(217,174,82,0.2)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
  gold: "#D9AE52",
};

const MAIN_ITEMS = [
  { id: "feed", label: "Fil", icon: Home },
  { id: "videos", label: "Vidéos", icon: Video },
  { id: "messages", label: "Chat", icon: MessageSquare },
  { id: "debates", label: "Débats", icon: TrendingUp },
  { id: "shop", label: "Shop", icon: Building2 },
];

const MORE_ITEMS = [
  { id: "discover", label: "Découvrir", icon: Compass },
  { id: "companies", label: "Entreprises", icon: Building2 },
  { id: "community", label: "Communauté", icon: Users },
  { id: "crypto", label: "BARO", icon: Coins, badge: "PRO" },
  { id: "wallet", label: "Portefeuille", icon: Wallet },
  { id: "offline", label: "Hors-ligne", icon: WifiOff, badge: "P2P" },
  { id: "assistant", label: "IA Assistant", icon: Sparkles },
  { id: "settings", label: "Réglages", icon: Settings },
];

export function Navigation({ activeTab, setActiveTab }) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  useApp();

  const goTo = (id) => {
    setActiveTab(id);
    setMoreOpen(false);
  };

  return (
    <>
      {/* =========================================================
          DESKTOP / WEB
          Navigation latérale légèrement réduite
         ========================================================= */}
      <nav
        className="hidden md:flex flex-col gap-1.5 p-3"
        style={{ background: C.surface }}
      >
        {MAIN_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                isActive ? "bg-white/10" : "hover:bg-white/5"
              }`}
              style={{
                color: isActive ? C.gold : C.ivory,
              }}
            >
              <Icon size={18} />

              <span className="font-medium text-xs">
                {t(`nav.${item.id}`, item.label)}
              </span>

              {item.badge && (
                <span
                  className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: C.gold,
                    color: C.bg,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div
          className="border-t my-1.5"
          style={{ borderColor: C.border }}
        />

        <button
          onClick={() => setMoreOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
          style={{ color: C.muted }}
        >
          <Menu size={18} />

          <span className="font-medium text-xs">
            {t("nav.more", "Plus")}
          </span>
        </button>
      </nav>

      {/* =========================================================
          MOBILE WEB / BAS DE L'ÉCRAN
          Onglets légèrement réduits
         ========================================================= */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t z-50"
        style={{
          background: C.surface,
          borderColor: C.border,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-around px-1 py-1">
          {MAIN_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-all"
                style={{
                  color: isActive ? C.gold : C.muted,
                }}
              >
                <Icon size={18} />

                <span className="text-[9px] font-medium">
                  {t(`nav.${item.id}`, item.label)}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-all"
            style={{
              color: MORE_ITEMS.some((m) => m.id === activeTab)
                ? C.gold
                : C.muted,
            }}
          >
            <Menu size={18} />

            <span className="text-[9px] font-medium">
              {t("nav.more", "Plus")}
            </span>
          </button>
        </div>
      </nav>

      {/* =========================================================
          MENU PLUS MOBILE
         ========================================================= */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end"
          style={{
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="rounded-t-3xl border-t p-4 pb-8 animate-in slide-in-from-bottom duration-200"
            style={{
              background: C.surface,
              borderColor: C.borderGold,
              paddingBottom:
                "calc(1rem + env(safe-area-inset-bottom))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="font-bold text-sm"
                style={{ color: C.ivory }}
              >
                {t("nav.more", "Plus")}
              </h3>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full hover:bg-white/5"
                style={{ color: C.muted }}
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
                    type="button"
                    onClick={() => goTo(item.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition active:scale-[0.98]"
                    style={{
                      background: isActive
                        ? "rgba(217,174,82,0.15)"
                        : "rgba(255,255,255,0.03)",
                      borderColor: isActive
                        ? C.borderGold
                        : C.border,
                      color: isActive ? C.gold : C.ivory,
                    }}
                  >
                    <Icon size={22} />

                    <span className="text-[11px] font-medium text-center leading-tight">
                      {t(`nav.${item.id}`, item.label)}
                    </span>

                    {item.badge && (
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{
                          background: C.gold,
                          color: C.bg,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
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
