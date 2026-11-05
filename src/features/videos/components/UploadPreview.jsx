import { cssFilterString } from "../filters/index.js";
import FilterOverlayCanvas from "./FilterOverlayCanvas.jsx";
import FilterPicker from "./FilterPicker.jsx";

// Aperçu de la vidéo choisie ou générée, avant publication.
// Le filtre n'est appliqué qu'aux vidéos « brutes » (galerie) : une vidéo générée
// ou filmée avec un filtre le contient déjà.
export default function UploadPreview({ creator, soundPicker, filter }) {
  const {
    previewVideoRef,
    previewAudioRef,
    previewUrl,
    bakedAudio,
    uploading,
    generated,
    backToCreator,
    resetUpload,
    fileInputRef,
    selectedFile,
  } = creator;
  const filterable = !!filter && !generated && !selectedFile?._filterBaked;
  const showFilter = filterable && filter.active;
  const { muteOriginal, selectedSound, stopSoundPreview } = soundPicker;

  return (
    <div className="space-y-3">
    <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/14] max-h-[52dvh]">
      <video
        ref={previewVideoRef}
        src={previewUrl}
        controls
        playsInline
        muted={muteOriginal && !!selectedSound?.audio_url && !bakedAudio}
        className="h-full w-full object-contain"
        style={{ filter: showFilter ? cssFilterString(filter.spec, 0.5) : "none" }}
        onPlay={() => {
          const a = previewAudioRef.current;
          if (!a) return;
          stopSoundPreview();
          a.currentTime = previewVideoRef.current?.currentTime || 0;
          a.play().catch(() => {});
        }}
        onPause={() => previewAudioRef.current?.pause()}
        onEnded={() => previewAudioRef.current?.pause()}
        onSeeked={() => {
          const a = previewAudioRef.current;
          if (a) a.currentTime = previewVideoRef.current?.currentTime || 0;
        }}
      />
      {showFilter && <FilterOverlayCanvas spec={filter.spec} />}
      {selectedSound?.audio_url && !bakedAudio && (
        <audio
          ref={previewAudioRef}
          src={selectedSound.audio_url}
          loop
          preload="auto"
        />
      )}
      <button
        disabled={uploading}
        onClick={() => {
          if (generated) {
            backToCreator();
            return;
          }
          resetUpload();
          fileInputRef.current?.click();
        }}
        className="absolute top-3 right-3 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md text-xs font-bold"
      >
        {generated ? "Modifier" : "Changer"}
      </button>
    </div>
    {filterable && <FilterPicker filter={filter} disabled={uploading} />}
    </div>
  );
}
