import { useState, useEffect } from "react";
import { Globe2, Coins, ChevronDown, Bell, Sparkles, User, Search, ShieldAlert } from "lucide-react";
import { COLORS as THEME_COLORS } from "../theme.js";
import { useApp } from "../contexts/AppContext.jsx";

const FALLBACK = {
  bg: "#0B1220", surface: "#111A2C", surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)", borderGold: "rgba(217,174,82,0.2)", borderTeal: "rgba(45,191,166,0.2)",
  ivory: "#F5F3EF", muted: "rgba(245,243,239,0.5)", gold: "#D9AE52", teal: "#2DBFA6",
  tealGlow: "rgba(45,191,166,0.15)", goldGlow: "rgba(217,174,82,0.15)", rose: "#EC4899",
};

const LANGUAGES = [
  { code: "fr", label: "Français" }, { code: "en", label: "English" },
  { code: "es", label: "Español" }, { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" }, { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" }, { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" }, { code: "de", label: "Deutsch" },
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

export function Header({ lang="fr", setLang, pointsBalance=0, baroBalance=0, userProfile, onOpenProfile, onOpenNotifications, onOpenSearch, pulsePoints=false }) {
  const C = {...FALLBACK,...(THEME_COLORS||{}) };
  const { isAnonymous } = useApp() || {};
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!pulsePoints) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 2800);
    return () => clearTimeout(t);
  }, [pulsePoints]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const close = () => setLangMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [langMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-[rgba(255,255,255,0.08)] backdrop-blur-xl">
      <div className="overflow-hidden py-1 border-b" style={{ borderColor: "rgba(217,174,82,0.15)", background: "rgba(11, 18, 32, 0.9)" }}>
        <div className="flex whitespace-nowrap py-0.5" style={{ animation: "meridian-scroll 32s linear infinite" }}>
          {[...TICKER_EVENTS,...TICKER_EVENTS].map((t,i) => (
            <span key={i} className="mx-6 text-[11px] tracking-wide flex items-center gap-1.5" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
              <Sparkles size={11} style={{ color: C.gold }} />{t}
            </span>
          ))}
        </div>
        <style>{`@keyframes meridian-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes points-pulse{0%,100%{box-shadow:0 0 0 0 rgba(217,174,82,0.5);transform:scale(1)}50%{box-shadow:0 0 0 8px rgba(217,174,82,0);transform:scale(1.06)}}`}</style>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg" style={{ background: "linear-gradient(135deg, #D9AE52 0%, #2DBFA6 100%)", color: C.bg, fontFamily: "'Fraunces', serif" }}>B</div>
          <div>
            <div className="flex items-center gap-1.5 font-extrabold text-lg tracking-wider font-serif" style={{ color: C.ivory }}>BAARO<span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-sans font-semibold" style={{ background: C.tealGlow, color: C.teal }}>v2.0</span></div>
            <div className="text-[10px] hidden sm:block tracking-widest uppercase" style={{ color: C.muted }}>Gagne · Échange · Convertis</div>
          </div>
        </div>

        <button onClick={onOpenSearch} className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium hover:border-amber-400/50 transition flex-1 max-w-xs" style={{ background: C.surface, borderColor: C.border, color: C.muted }}>
          <Search size={14} style={{ color: C.gold }} /><span className="truncate">Rechercher membres, hashtags...</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={onOpenSearch} className="sm:hidden p-2 rounded-lg border hover:opacity-80 transition" style={{ background: C.surface, borderColor: C.border, color: C.gold }}><Search size={16} /></button>

          {isAnonymous && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold" style={{ background: "rgba(236,72,153,0.12)", borderColor: "rgba(236,72,153,0.35)", color: C.rose }} title="Mode invité">
              <ShieldAlert size={12} />Invité
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-inner transition" style={{ background: C.surface2, borderColor: pulse? C.gold : C.borderGold, animation: pulse? "points-pulse 0.9s ease-in-out 3" : "none" }}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: C.gold, color: C.bg }}><Coins size={12} /></div>
            <div className="flex flex-col">
              <span className="text-[10px] leading-3" style={{ color: C.muted }}>Solde</span>
              <span style={{ color: C.gold }} className="font-mono leading-3">{pointsBalance} pts</span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold" style={{ background: C.surface2, borderColor: C.borderTeal }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.teal }} />
            <div className="flex flex-col">
              <span className="text-[10px] leading-3" style={{ color: C.muted }}>BARO Coin</span>
              <span style={{ color: C.teal }} className="font-mono leading-3">{Number(baroBalance||0).toFixed(2)} BARO</span>
            </div>
          </div>

          <div className="relative" onClick={(e)=>e.stopPropagation()}>
            <button onClick={() => setLangMenuOpen(v=>!v)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:border-amber-500/40 transition" style={{ background: C.surface, borderColor: C.border, color: C.ivory }}>
              <Globe2 size={14} style={{ color: C.teal }} /><span className="uppercase">{lang}</span><ChevronDown size={12} style={{ color: C.muted }} />
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 mt-2 w-36 rounded-xl p-1.5 shadow-2xl glass-panel border z-50 max-h-60 overflow-y-auto" style={{ borderColor: C.borderGold, background: C.surface }}>
                {LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => { setLang(l.code); setLangMenuOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition ${lang===l.code? "font-bold":""}`} style={{ background: lang===l.code? C.goldGlow : "transparent", color: lang===l.code? C.gold : C.ivory }}>{l.label}</button>
                ))}
              </div>
            )}
          </div>

          <button onClick={onOpenNotifications} className="p-2 rounded-lg relative hover:opacity-80 transition border" style={{ background: C.surface, borderColor: C.border, color: C.ivory }}>
            <Bell size={16} /><span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: C.gold }} />
          </button>

          <button onClick={onOpenProfile} className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full border hover:border-amber-500/50 transition" style={{ background: C.surface2, borderColor: C.borderGold }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: C.gold, color: C.bg }}>
              {userProfile?.display_name? userProfile.display_name.charAt(0).toUpperCase() : <User size={14} />}
            </div>
            <span className="text-xs font-semibold hidden md:inline truncate max-w-[80px]" style={{ color: C.ivory }}>{userProfile?.display_name || "Membre"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
