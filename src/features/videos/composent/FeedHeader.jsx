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
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
              aria-label="Retour"
            >
              <X size={18} />
            </button>
          )}
          {!logoFailed && (
            <img
              src={baaroLogo}
              alt="BAARO"
              className="h-9 w-9 rounded-full object-cover border border-white/20 bg-zinc-900 shrink-0"
              onError={() => setLogoFailed(true)}
            />
          )}
          <div>
            <h1 className="text-base font-black tracking-tight">BAARO</h1>
            <p className="text-[10px] text-white/50">Vidéos</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenStudio && (
            <button
              onClick={onOpenStudio}
              className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
              style={{ color: COLORS.gold }}
              aria-label="Studio vidéo NextGen"
            >
              <Sparkles size={18} />
            </button>
          )}
          <button
            onClick={onToggleMute}
            className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center"
            aria-label={muted ? "Activer le son" : "Couper le son"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            onClick={onOpenUpload}
            className="h-9 w-9 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: COLORS.gold, color: "#000" }}
            aria-label="Publier"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <div className="p-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex gap-1">
          <button
            onClick={() => setMode("forYou")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold ${
              mode === "forYou" ? "bg-white text-black" : "text-white/60"
            }`}
          >
            Pour toi
          </button>
          <button
            onClick={() => setMode("trending")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold ${
              mode === "trending" ? "bg-white text-black" : "text-white/60"
            }`}
          >
            Tendances
          </button>
        </div>
      </div>
    </header>
  );
}
