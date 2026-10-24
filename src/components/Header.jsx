import { useState, useEffect } from "react";
import {
  Globe2,
  ChevronDown,
  Bell,
  Sparkles,
  User,
  Search,
  ShieldAlert,
  Plus,
  X,
} from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";
import { setAppLanguage, SUPPORTED_LANGUAGES } from "../../i18n.js";

const FALLBACK = {
  bg: "#0B1220",
  surface: "#111A2C",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  borderGold: "rgba(217,174,82,0.2)",
  borderTeal: "rgba(45,191,166,0.2)",
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.5)",
  gold: "#D9AE52",
  teal: "#2DBFA6",
  tealGlow: "rgba(45,191,166,0.15)",
  goldGlow: "rgba(217,174,82,0.15)",
  rose: "#EC4899",
};

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "nqo", label: "ߒߞߏ" },
  { code: "bm", label: "Bamanankan" },
  { code: "boz", label: "Bozo" },
  { code: "dog", label: "Dogon" },
  { code: "snk", label: "Soninké" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
  { code: "sw", label: "Kiswahili" },
  { code: "wo", label: "Wolof" },
  { code: "ha", label: "Hausa" },
  { code: "ff", label: "Fulfulde" },
].filter((language) => SUPPORTED_LANGUAGES.includes(language.code));

const TICKER_EVENTS = [
  "🌍 BAARO — réseau social international",
  "🤝 Découvre, crée, échange et collabore",
  "🔒 Confidentialité et sécurité au cœur de BAARO",
  "🎬 Crée et partage tes vidéos",
  "🌐 Expérience multilingue",
];

export function Header({
  lang = "fr",
  setLang,
  userProfile,
  onOpenProfile,
  onOpenNotifications,
  notificationCount = 0,
  onOpenSearch,
  isCreateOpen = false,
  onToggleCreate,
}) {
  const C = { ...FALLBACK, ...(THEME_COLORS || {}) };
  const { isAnonymous } = useApp() || {};

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [currentLang, setCurrentLang] = useState(lang);

  useEffect(() => {
    setCurrentLang(lang);
  }, [lang]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [userProfile?.avatar_url]);

  useEffect(() => {
    if (!langMenuOpen) return;

    const close = () => setLangMenuOpen(false);
    window.addEventListener("click", close);

    return () => window.removeEventListener("click", close);
  }, [langMenuOpen]);

  const handleLanguageChange = async (code) => {
    if (
      changingLanguage ||
      !SUPPORTED_LANGUAGES.includes(code)
    ) {
      return;
    }

    setChangingLanguage(true);

    try {
      await setAppLanguage(code);
      setCurrentLang(code);

      if (typeof setLang === "function") {
        setLang(code);
      }

      setLangMenuOpen(false);
    } catch (error) {
      console.error("Impossible de changer la langue :", error);
    } finally {
      setChangingLanguage(false);
    }
  };

  const handleCreateClick = () => {
    if (!onToggleCreate) return;

    onToggleCreate();

    if (!isCreateOpen) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const showAvatar =
    Boolean(userProfile?.avatar_url) && !avatarBroken;

  const initial = userProfile?.display_name
    ? userProfile.display_name.charAt(0).toUpperCase()
    : null;

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-[rgba(255,255,255,0.08)]">
      {/* Bandeau compact */}
      <div
        className="overflow-hidden py-0.5 border-b"
        style={{
          borderColor: "rgba(217,174,82,0.12)",
          background: "rgba(11,18,32,0.9)",
        }}
      >
        <div
          className="flex whitespace-nowrap py-0"
          style={{
            animation: "meridian-scroll 32s linear infinite",
          }}
        >
          {[...TICKER_EVENTS, ...TICKER_EVENTS].map((event, index) => (
            <span
              key={index}
              className="mx-4 text-[10px] tracking-wide flex items-center gap-1"
              style={{
                color: C.muted,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              <Sparkles size={10} style={{ color: C.gold }} />
              {event}
            </span>
          ))}
        </div>

        <style>
          {`@keyframes meridian-scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }`}
        </style>
      </div>

      {/* Barre principale affinée */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Logo */}
        <div
          className="flex items-center gap-1.5 cursor-pointer shrink-0"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden flex items-center justify-center border shrink-0"
            style={{
              borderColor: C.borderGold,
              background: C.bg,
            }}
          >
            <img
              src="./brand/baaro-logo.png"
              alt="BAARO"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>

          <div
            className="text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-bold"
            style={{
              background: C.tealGlow,
              color: C.teal,
            }}
          >
            v0.1.0
          </div>
        </div>

        {/* Recherche desktop */}
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition flex-1 max-w-xs"
          style={{
            background: C.surface,
            borderColor: C.border,
            color: C.muted,
          }}
        >
          <Search size={13} style={{ color: C.gold }} />
          <span className="truncate">
            Rechercher membres, hashtags...
          </span>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Recherche mobile */}
          <button
            onClick={onOpenSearch}
            aria-label="Rechercher"
            className="sm:hidden p-1.5 rounded-lg border transition"
            style={{
              background: C.surface,
              borderColor: C.border,
              color: C.gold,
            }}
          >
            <Search size={14} />
          </button>

          {/* Badge invité */}
          {isAnonymous && (
            <div
              className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold"
              style={{
                background: "rgba(236,72,153,0.12)",
                borderColor: "rgba(236,72,153,0.35)",
                color: C.rose,
              }}
              title="Mode invité"
            >
              <ShieldAlert size={11} />
              Invité
            </div>
          )}

          {/* Création */}
          <button
            onClick={handleCreateClick}
            aria-label={isCreateOpen ? "Fermer la création" : "Créer"}
            className="flex items-center gap-1 px-2 py-1.5 rounded-full font-bold text-xs border transition-all active:scale-95"
            style={{
              background: isCreateOpen ? C.surface2 : C.gold,
              borderColor: C.borderGold,
              color: isCreateOpen ? C.ivory : "#000",
            }}
          >
            {isCreateOpen ? (
              <X size={13} />
            ) : (
              <Plus size={13} strokeWidth={3} />
            )}
            <span className="hidden xs:inline">
              {isCreateOpen ? "Fermer" : "Créer"}
            </span>
          </button>

          {/* Langue */}
          <div
            className="relative shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setLangMenuOpen((open) => !open)}
              aria-label="Changer la langue"
              aria-expanded={langMenuOpen}
              className="flex items-center gap-1 px-1.5 py-1.5 rounded-lg text-xs border transition"
              style={{
                background: C.surface,
                borderColor: C.border,
                color: C.ivory,
              }}
            >
              <Globe2 size={12} style={{ color: C.teal }} />
              <span className="uppercase text-[10px]">
                {currentLang}
              </span>
              <ChevronDown size={10} style={{ color: C.muted }} />
            </button>

            {langMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-40 rounded-xl p-1 shadow-2xl border z-50 max-h-56 overflow-y-auto"
                style={{
                  borderColor: C.borderGold,
                  background: C.surface,
                }}
              >
                {LANGUAGES.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    disabled={changingLanguage}
                    onClick={() =>
                      handleLanguageChange(language.code)
                    }
                    className="w-full text-left px-2.5 py-2 text-xs rounded-lg transition disabled:opacity-50"
                    style={{
                      background:
                        currentLang === language.code
                          ? C.goldGlow
                          : "transparent",
                      color:
                        currentLang === language.code
                          ? C.gold
                          : C.ivory,
                    }}
                  >
                    {language.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <button
            onClick={onOpenNotifications}
            aria-label="Notifications"
            className="p-1.5 rounded-lg relative border transition"
            style={{
              background: C.surface,
              borderColor: C.border,
              color: C.ivory,
            }}
          >
            <Bell size={14} />
            {notificationCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ background: C.gold, color: C.bg }}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>

          {/* Profil */}
          <button
            onClick={onOpenProfile}
            aria-label="Voir le profil"
            className="flex items-center gap-1 p-1 rounded-full border transition shrink-0"
            style={{
              background: C.surface2,
              borderColor: C.borderGold,
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden"
              style={{
                background: C.gold,
                color: C.bg,
              }}
            >
              {showAvatar ? (
                <img
                  src={userProfile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setAvatarBroken(true)}
                />
              ) : initial ? (
                initial
              ) : (
                <User size={13} />
              )}
            </div>

            <span
              className="hidden md:inline text-xs font-semibold truncate max-w-[80px] pr-1"
              style={{ color: C.ivory }}
            >
              {userProfile?.display_name || "Membre"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
