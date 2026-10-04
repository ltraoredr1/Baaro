import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK = {
  muted: "rgba(245,243,239,0.5)",
  ivory: "#F5F3EF",
  gold: "#D9AE52",
  bg: "#0B1220",
};

export function TabFallback() {
  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: C.muted }}>
      <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
      <span className="text-[13px]">Chargement de l&apos;onglet…</span>
    </div>
  );
}

export function LoadingScreen({ message = "Chargement de BAARO..." }) {
  const C = {...FALLBACK,...(THEME_COLORS || {}) };
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center" style={{ background: C.bg, color: C.ivory }}>
      <div className="text-center px-6">
        <div className="text-5xl mb-4 animate-pulse">🌍</div>
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-white/10 border-t-[#D9AE52] animate-spin" />
        <p className="text-[13px] tracking-wide" style={{ color: C.muted }}>{message}</p>
      </div>
    </div>
  );
}

export function InlineLoader({ size = 20 }) {
  return <div className="animate-spin rounded-full border-2 border-white/20 border-t-white/60" style={{ width: size, height: size }} />;
}
