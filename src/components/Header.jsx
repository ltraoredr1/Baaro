import { useState } from "react";
import {
  Globe2,
  Coins,
  ChevronDown,
  Bell,
  Sparkles,
  User,
  Search,
  ShieldAlert,
} from "lucide-react";
import { COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "de", label: "Deutsch" },
  { code: "sw", label: "Kiswahili" },
];

const TICKER_EVENTS = [
  "🇰🇷 Séoul — +12 pts pour publication populaire",
  "🇧🇷 São Paulo — +8 pts pour un commentaire utile",
  "🇩🇪 Berlin — +20 pts pour parrainage validé",
  "🇮🇳 Mumbai — +15 pts pour vidéo partagée",
  "🇺🇸 Austin — +6 pts avec l'assistant IA",
  "🇰🇪 Nairobi — +18 pts contenu certifié",
  "🇯🇵 Osaka — +10 pts pour 7j d'activité",
];

export function Header({
  lang,
  setLang,
  pointsBalance = 0,
  baroBalance = 0,
  userProfile,
  onOpenProfile,
  onOpenNotifications,
  onOpenSearch,
}) {
  const { isAnonymous } = useApp();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-[rgba(255,255,255,0.08)]">
      {/* Ticker banner */}
      <div
        className="overflow-hidden py-1 border-b"
        style={{
          borderColor: "rgba(217,174,82,0.15)",
          background: "rgba(11, 18, 32, 0.9)",
        }}
      >
        <div
          className="flex whitespace-nowrap py-0.5"
          style={{ animation: "meridian-scroll 32s linear infinite" }}
        >
          {[...TICKER_EVENTS, ...TICKER_EVENTS].map((t, i) => (
            <span
              key={i}
              className="mx-6 text-[11px] tracking-wide flex items-center gap-1.5"
              style={{
                color: COLORS.muted,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              <Sparkles size={11} style={{ color: COLORS.gold }} />
              {t}
            </span>
          ))}
        </div>
        <style>{`@keyframes meridian-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg gold-glow"
            style={{
              background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)",
              color: COLORS.bg,
              fontFamily: "'Fraunces', serif",
            }}
          >
            B
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-extrabold text-lg tracking-wider text-gradient-gold font-serif">
              BAARO
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-sans font-semibold"
                style={{ background: COLORS.tealGlow, color: COLORS.teal }}
              >
                v1.9
              </span>
            </div>
            <div
              className="text-[10px] hidden sm:block tracking-widest uppercase"
              style={{ color: COLORS.muted }}
            >
              Réseau Mondial & Crypto
            </div>
          </div>
        </div>

        {/* Global Search trigger */}
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium hover:border-amber-400/50 transition flex-1 max-w-xs"
          style={{
            background: COLORS.surface,
            borderColor: COLORS.border,
            color: COLORS.muted,
          }}
        >
          <Search size={14} style={{ color: COLORS.gold }} />
          <span>Rechercher membres, hashtags...</span>
        </button>

        {/* Status Indicators & Right Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile search */}
          <button
            onClick={onOpenSearch}
            className="sm:hidden p-2 rounded-lg border hover:opacity-80 transition"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.gold,
            }}
          >
            <Search size={16} />
          </button>

          {/* Badge Invité */}
          {isAnonymous && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold"
              style={{
                background: "rgba(236,72,153,0.12)",
                borderColor: "rgba(236,72,153,0.35)",
                color: COLORS.rose,
              }}
              title="Mode invité — créez un compte pour gagner des points"
            >
              <ShieldAlert size={12} />
              Invité
            </div>
          )}

          {/* Points Pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-inner"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.borderGold,
            }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              <Coins size={12} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] leading-3" style={{ color: COLORS.muted }}>
                Solde
              </span>
              <span style={{ color: COLORS.gold }} className="font-mono leading-3">
                {pointsBalance} pts
              </span>
            </div>
          </div>

          {/* BARO Crypto Pill */}
          <div
            className="hidden xs:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.borderTeal,
            }}
          >
            <span
              className="w-2 h-2 rounded-full animate-ping"
              style={{ background: COLORS.teal }}
            />
            <div className="flex flex-col">
              <span className="text-[10px] leading-3" style={{ color: COLORS.muted }}>
                BARO Coin
              </span>
              <span style={{ color: COLORS.teal }} className="font-mono leading-3">
                {Number(baroBalance).toFixed(2)} BARO
              </span>
            </div>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:border-amber-500/40 transition"
              style={{
                background: COLORS.surface,
                borderColor: COLORS.border,
                color: COLORS.ivory,
              }}
            >
              <Globe2 size={14} style={{ color: COLORS.teal }} />
              <span className="uppercase">{lang}</span>
              <ChevronDown size={12} style={{ color: COLORS.muted }} />
            </button>

            {langMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-36 rounded-xl p-1.5 shadow-2xl glass-panel border z-50 max-h-60 overflow-y-auto"
                style={{ borderColor: COLORS.borderGold }}
              >
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLang(l.code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition ${
                      lang === l.code ? "font-bold" : ""
                    }`}
                    style={{
                      background:
                        lang === l.code ? COLORS.goldGlow : "transparent",
                      color: lang === l.code ? COLORS.gold : COLORS.ivory,
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <button
            onClick={onOpenNotifications}
            className="p-2 rounded-lg relative hover:opacity-80 transition border"
            style={{
              background: COLORS.surface,
              borderColor: COLORS.border,
              color: COLORS.ivory,
            }}
          >
            <Bell size={16} />
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ background: COLORS.gold }}
            />
          </button>

          {/* User Profile */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full border hover:border-amber-500/50 transition"
            style={{
              background: COLORS.surface2,
              borderColor: COLORS.borderGold,
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
              style={{ background: COLORS.gold, color: COLORS.bg }}
            >
              {userProfile?.display_name ? (
                userProfile.display_name.charAt(0).toUpperCase()
              ) : (
                <User size={14} />
              )}
            </div>
            <span
              className="text-xs font-semibold hidden md:inline"
              style={{ color: COLORS.ivory }}
            >
              {userProfile?.display_name || "Membre"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
