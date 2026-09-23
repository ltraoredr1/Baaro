import { Component } from "react";
import { COLORS as THEME_COLORS } from "../theme.js";

const FALLBACK = {
  ivory: "#F5F3EF",
  muted: "rgba(245,243,239,0.6)",
  gold: "#D9AE52",
  surface: "#0B1220",
  surface2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.1)",
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[BAARO] ErrorBoundary:", error, errorInfo);

    // Auto-reload si chunk Vercel obsolète - c'est ton Failed to fetch
    const msg = String(error?.message || "");
    const isChunkError = msg.includes("Failed to fetch") || msg.includes("dynamically imported") || msg.includes("Loading chunk") || msg.includes("Importing a module script failed");

    if (isChunkError) {
      const lastReload = Number(sessionStorage.getItem("baaro_chunk_reload") || 0);
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem("baaro_chunk_reload", String(Date.now()));
        window.location.reload();
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const C = {...FALLBACK,...(THEME_COLORS || {}) };

    if (this.state.hasError) {
      const isChunk = String(this.state.error?.message || "").includes("Failed to fetch");

      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6" style={{ background: C.surface, color: C.ivory }}>
          <div className="text-center max-w-[340px] w-full rounded-2xl border p-6" style={{ background: C.surface2, borderColor: C.border }}>
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-[15px] font-bold mb-2" style={{ color: C.gold }}>
              {isChunk? "Mise à jour disponible" : "Une erreur est survenue"}
            </h2>
            <p className="text-[13px] mb-2 leading-[1.4]" style={{ color: C.muted }}>
              {isChunk
               ? "Une nouvelle version de BAARO a été déployée. Recharge pour continuer."
                : "Cet onglet a rencontré un problème. Tu peux réessayer sans perdre ta session."}
            </p>
            {this.state.error &&!isChunk && (
              <p className="text-[10px] font-mono mb-5 p-2 rounded-lg bg-black/30 break-all" style={{ color: C.muted }}>
                {String(this.state.error.message).slice(0,120)}
              </p>
            )}
            <div className="flex gap-2.5 justify-center">
              {!isChunk && (
                <button onClick={this.handleReset} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: C.surface2, color: C.ivory, border: `1px solid ${C.border}` }}>
                  Réessayer
                </button>
              )}
              <button onClick={this.handleReload} className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: `linear-gradient(135deg, ${C.gold} 0%, #2DBFA6 100%)`, color: "#0B1220" }}>
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
