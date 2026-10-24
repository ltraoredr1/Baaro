import { useState } from "react";
import { Plus, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { baaroLogo } from "../constants.js";

export default function FeedHeader({
  onExit,
  muted,
  onToggleMute,
  onOpenUpload,
  onOpenStudio,
  mode,
  setMode,
  showModeSwitcher = true,
  extraActions = null,
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none backdrop-blur-md">
      
      {/* LIGNE SUPÉRIEURE : RETOUR / LOGO / VERSION + ACTIONS RAPIDES */}
      <div className="flex items-center justify-between pointer-events-auto">
        
        {/* GAUCHE : Bouton retour + Logo & Version v0.1.0 */}
        <div className="flex items-center gap-2.5">
          {onExit && (
            <button
              onClick={onExit}
              className="h-9 w-9 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center transition-transform active:scale-95 shadow-lg text-white hover:bg-white/20"
              aria-label="Retour"
            >
              <X size={17} />
            </button>
          )}

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-black/40 border border-amber-500/30 backdrop-blur-xl shadow-lg">
            {!logoFailed && (
              <img
                src={baaroLogo}
                alt="BAARO"
                className="h-7 w-7 rounded-xl object-cover border border-amber-400/40 bg-zinc-900 shrink-0"
                onError={() => setLogoFailed(true)}
              />
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-widest bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono">
              v0.1.0
            </span>
          </div>
        </div>

        {/* DROITE : Studio, Son et Upload stylés */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onOpenStudio && (
            <button
              onClick={onOpenStudio}
              className="h-9 w-9 rounded-2xl bg-teal-500/10 border border-teal-500/30 backdrop-blur-xl flex items-center justify-center transition-all hover:scale-105 shadow-lg"
              style={{ color: COLORS.teal || "#2DBFA6" }}
              aria-label="Studio vidéo NextGen"
              title="Studio Vidéo"
            >
              <Sparkles size={17} />
            </button>
          )}

          {extraActions}

          <button
            onClick={onToggleMute}
            className="h-9 w-9 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xl flex items-center justify-center transition-all hover:scale-105 shadow-lg text-white"
            aria-label={muted ? "Activer le son" : "Couper le son"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          <button
            onClick={onOpenUpload}
            className="h-9 w-9 rounded-2xl flex items-center justify-center shadow-xl transition-all hover:scale-105 active:scale-95 border border-amber-400/40"
            style={{ background: COLORS.gold || "#D9AE52", color: "#000" }}
            aria-label="Publier"
            title="Créer une vidéo"
          >
            <Plus size={19} className="stroke-[3]" />
          </button>
        </div>
      </div>

      {/* LIGNE INFÉRIEURE : SÉLECTEUR DE FILTRE (Pour toi / Tendances) */}
      {showModeSwitcher && <div className="mt-2.5 flex justify-center pointer-events-auto">
        <div className="p-1 rounded-full bg-black/60 backdrop-blur-2xl border border-white/15 flex gap-1 shadow-2xl">
          <button
            onClick={() => setMode("forYou")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
              mode === "forYou" 
                ? "bg-amber-400 text-black shadow-md scale-105" 
                : "text-white/70 hover:text-white"
            }`}
          >
            Pour toi
          </button>
          <button
            onClick={() => setMode("trending")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
              mode === "trending" 
                ? "bg-amber-400 text-black shadow-md scale-105" 
                : "text-white/70 hover:text-white"
            }`}
          >
            Tendances
          </button>
        </div>
      </div>}
    </header>
  );
}
