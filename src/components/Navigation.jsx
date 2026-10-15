import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Home,
  Video,
  MessageSquare,
  Users,
  TrendingUp,
  WifiOff,
  Sparkles,
  Lightbulb,
  Settings,
  Building2,
  Compass,
  Banknote,
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
  borderGold: "rgba(217,174,82,0.25)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
  gold: "#D9AE52",
};

const MAIN_ITEMS = [
  { id: "feed", label: "Fil", icon: Home },
  { id: "stories", label: "Stories", icon: Sparkles },
  { id: "videos", label: "Vidéos", icon: Video },
  { id: "messages", label: "Chat", icon: MessageSquare },
  { id: "debates", label: "Débats", icon: TrendingUp },
  { id: "shop", label: "Shop", icon: Building2 },
];

const MORE_ITEMS = [
  { id: "community", label: "Communauté", icon: Users },
  { id: "economy", label: "Revenus", icon: Banknote },
  { id: "discover", label: "Découvrir", icon: Compass },
  { id: "companies", label: "Entreprises", icon: Building2 },
  { id: "offline", label: "Hors-ligne", icon: WifiOff, badge: "P2P" },
  { id: "assistant", label: "IA Assistant", icon: Sparkles },
  { id: "innovation", label: "Innovation", icon: Lightbulb, badge: "NEW" },
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
          DESKTOP (Écrans larges uniquement: lg et plus)
         ========================================================= */}
      <nav
        className="hidden lg:flex flex-col gap-2 p-3.5 rounded-3xl border backdrop-blur-xl shadow-xl sticky top-20"
        style={{ background: "rgba(17, 26, 44, 0.8)", borderColor: C.border }}
      >
        {MAIN_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl transition-all duration-300 group ${
                isActive ? "shadow-md scale-[1.02]" : "hover:bg-white/5"
              }`}
              style={{
                background: isActive ? "rgba(217,174,82,0.15)" : "transparent",
                borderColor: isActive ? C.borderGold : "transparent",
                color: isActive ? C.gold : C.ivory,
                borderWidth: isActive ? "1px" : "0px",
              }}
            >
              <Icon size={19} className={`transition-transform group-hover:scale-110 ${isActive ? "text-amber-400" : "text-white/70"}`} />

              <span className={`font-semibold text-xs tracking-wide ${isActive ? "font-bold" : ""}`}>
                {t(`nav.${item.id}`, item.label)}
              </span>

              {item.badge && (
                <span
                  className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-mono font-bold shadow-sm"
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
          className="border-t my-2"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        />

        <button
          onClick={() => setMoreOpen(true)}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-white/5 transition-all duration-300 text-white/70 hover:text-white cursor-pointer"
        >
          <Menu size={19} />
          <span className="font-semibold text-xs">
            {t("nav.more", "Plus")}
          </span>
        </button>
      </nav>

      {/* =========================================================
          TABLETTES & MOBILE (Affiché en dessous de lg)
         ========================================================= */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 border-t z-50 backdrop-blur-2xl shadow-2xl"
        style={{
          background: "rgba(11, 18, 32, 0.95)",
          borderColor: "rgba(255,255,255,0.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-around px-1.5 py-2">
          {MAIN_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all duration-300 ${
                  isActive ? "scale-105" : "hover:opacity-100 opacity-70"
                }`}
                style={{
                  color: isActive ? C.gold : C.muted,
                }}
              >
                <div className={`p-1 rounded-xl transition-all ${isActive ? "bg-amber-400/15 shadow-inner" : ""}`}>
                  <Icon size={19} />
                </div>
                <span className="text-[9px] sm:text-[10px] font-semibold tracking-tight">
                  {t(`nav.${item.id}`, item.label)}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMoreOpen(true);
            }}
            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all duration-300 cursor-pointer ${
              MORE_ITEMS.some((m) => m.id === activeTab) || moreOpen ? "text-amber-400 scale-105" : "text-white/50 hover:text-white"
            }`}
          >
            <div className="p-1 rounded-xl bg-white/5">
              <Menu size={19} />
            </div>
            <span className="text-[9px] sm:text-[10px] font-semibold tracking-tight">
              {t("nav.more", "Plus")}
            </span>
          </button>
        </div>
      </nav>

      {/* =========================================================
          MENU "PLUS" (MODALE UNIVERSELLE TABLETTES & MOBILE)
         ========================================================= */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-end backdrop-blur-md animate-in fade-in duration-200"
          style={{
            background: "rgba(0,0,0,0.65)",
          }}
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="rounded-t-3xl border-t p-5 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom duration-300 max-w-2xl mx-auto w-full"
            style={{
              background: "rgba(17, 26, 44, 0.98)",
              borderColor: C.borderGold,
              paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="font-extrabold text-base tracking-wide flex items-center gap-2"
                style={{ color: C.ivory }}
              >
                <Sparkles size={16} style={{ color: C.gold }} />
                {t("nav.more", "Plus d'options")}
              </h3>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition text-white/70 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3.5">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(item.id)}
                    className="relative flex flex-col items-center gap-2.5 p-3.5 rounded-2xl border transition-all duration-300 active:scale-95 group shadow-lg cursor-pointer"
                    style={{
                      background: isActive
                        ? "rgba(217,174,82,0.18)"
                        : "rgba(255,255,255,0.04)",
                      borderColor: isActive
                        ? C.borderGold
                        : "rgba(255,255,255,0.08)",
                      color: isActive ? C.gold : C.ivory,
                    }}
                  >
                    <div className="p-2 rounded-xl bg-white/5 group-hover:scale-110 transition-transform">
                      <Icon size={22} />
                    </div>

                    <span className="text-[11px] font-bold text-center leading-tight truncate w-full">
                      {t(`nav.${item.id}`, item.label)}
                    </span>

                    {item.badge && (
                      <span
                        className="absolute top-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full font-mono font-bold shadow-md"
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
