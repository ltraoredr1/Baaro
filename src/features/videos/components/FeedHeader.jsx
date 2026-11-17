import { useState } from "react";
import {
  Sparkles,
  Volume2,
  VolumeX,
  SlidersHorizontal,
} from "lucide-react";

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
  headerActions = null,
}) {
  const [controlsOpen, setControlsOpen] = useState(false);

  const tabs = [
    { id: "forYou", label: "Pour moi" },
    { id: "friends", label: "Amis" },
    { id: "trending", label: "Tendance" },
    { id: "newest", label: "Nouveautés" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div className="w-11 shrink-0" aria-hidden="true" />

          {showModeSwitcher && (
            <nav
              aria-label="Fil vidéo"
              className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-black/20 p-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMode(tab.id)}
                  aria-pressed={mode === tab.id}
                  className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-2 text-[11px] font-bold transition-all ${
                    mode === tab.id
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 pointer-events-auto">
          {headerActions}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setControlsOpen((open) => !open)}
              className="h-10 w-10 rounded-full flex items-center justify-center bg-black/30 border border-white/20 text-white backdrop-blur-xl shadow-lg active:scale-95"
              aria-label="Ouvrir les commandes vidéo"
              aria-expanded={controlsOpen}
            >
              <SlidersHorizontal size={19} />
            </button>

            {controlsOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Fermer les commandes"
                  onClick={() => setControlsOpen(false)}
                />

                <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-2xl">
                  {onOpenStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        setControlsOpen(false);
                        onOpenStudio();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-teal-300 hover:bg-white/10"
                    >
                      <Sparkles size={17} />
                      Studio IA
                    </button>
                  )}

                  {extraActions && (
                    <div className="flex flex-col gap-1 [&>button]:!w-full [&>button]:!justify-start [&>button]:!rounded-xl [&>button]:!border-0 [&>button]:!bg-white/5 [&>button]:!px-3 [&>button]:!py-3">
                      {extraActions}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    {muted ? "Activer le son" : "Couper le son"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
