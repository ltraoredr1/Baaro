import { ChevronDown, Music2, Pause, Play } from "lucide-react";
import { COLORS } from "../../../theme.js";

// Sélecteur de son ; soundPicker = retour de useSoundPicker.
export default function SoundPicker({ soundPicker, hasFile, bakedAudio }) {
  const {
    sounds,
    selectedSound,
    showSoundPicker,
    setShowSoundPicker,
    muteOriginal,
    setMuteOriginal,
    previewingSoundId,
    soundFileInputRef,
    stopSoundPreview,
    toggleSoundPreview,
    chooseSound,
    handleSoundFile,
  } = soundPicker;

  return (
    <>
      <button
        onClick={() => {
          stopSoundPreview();
          setShowSoundPicker((value) => !value);
        }}
        className="w-full flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm min-w-0">
          <Music2 size={17} className="shrink-0" />
          <span className="truncate">
            {selectedSound?.title || selectedSound?.name || "Ajouter un son"}
          </span>
        </span>
        <ChevronDown
          size={17}
          className={showSoundPicker ? "rotate-180 transition" : "transition"}
        />
      </button>

      <input
        ref={soundFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          handleSoundFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {showSoundPicker && (
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <button
            onClick={() => soundFileInputRef.current?.click()}
            className="w-full px-4 py-3 text-left text-sm font-bold border-b border-white/10"
            style={{ color: COLORS.gold }}
          >
            🎵 Importer mon audio
          </button>
          <button
            onClick={() => chooseSound(null)}
            className="w-full px-4 py-3 text-left text-sm border-b border-white/10"
          >
            Aucun son (son d'origine)
          </button>
          <div className="max-h-56 overflow-y-auto">
            {sounds.length === 0 && (
              <p className="px-4 py-4 text-xs text-white/40">
                Aucun son dans la bibliothèque. Importe ton propre audio
                ci-dessus.
              </p>
            )}
            {sounds.map((item) => {
              const key = String(item.id);
              const isPreviewing = previewingSoundId === key;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-2 border-b border-white/5 last:border-0"
                >
                  <button
                    onClick={() => toggleSoundPreview(item)}
                    className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center"
                    aria-label={isPreviewing ? "Arrêter l'écoute" : "Écouter"}
                  >
                    {isPreviewing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    onClick={() => chooseSound(item)}
                    className="flex-1 min-w-0 py-3 text-left text-sm"
                  >
                    <div className="font-bold truncate">
                      {item.title || item.name || "Son BAARO"}
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      {item.artist || "Audio BAARO"}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasFile && selectedSound?.audio_url && !bakedAudio && (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <span>Couper le son d'origine de la vidéo</span>
          <input
            type="checkbox"
            checked={muteOriginal}
            onChange={(event) => setMuteOriginal(event.target.checked)}
            className="h-5 w-5"
          />
        </label>
      )}
    </>
  );
}
