import { useEffect } from "react";
import { cssFilterString } from "../filters/index.js";
import FilterOverlayCanvas from "./FilterOverlayCanvas.jsx";
import EffectsPanel from "./EffectsPanel.jsx";
import FaceFxCanvas from "./FaceFxCanvas.jsx";

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
  const showFilter = filterable && !!filter.spec;
  const {
    muteOriginal, selectedSound, stopSoundPreview,
    soundVolume, originalVolume,
  } = soundPicker;

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.volume = Math.max(0, Math.min(1, originalVolume / 100));
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = Math.max(0, Math.min(1, soundVolume / 100));
    }
  }, [previewUrl, selectedSound, soundVolume, originalVolume]);

  return (
    <div className="space-y-3">
    <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/14] max-h-[52dvh]">
      <video
        ref={previewVideoRef}
        src={previewUrl}
        controls
        playsInline
        muted={(muteOriginal || originalVolume <= 0) && !!selectedSound?.audio_url && !bakedAudio}
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
      {filterable && <FaceFxCanvas videoRef={previewVideoRef} fx={filter.face} cssFilter={showFilter ? cssFilterString(filter.spec, 0.5) : "none"} />}
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
    {selectedSound?.audio_url && !bakedAudio && (
      <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 space-y-3">
        <div className="text-xs font-bold text-white/80">Mixage audio</div>
        <label className="block space-y-1">
          <span className="flex justify-between text-xs text-white/70">
            <span>Musique / son ajouté</span><span>{soundVolume}%</span>
          </span>
          <input type="range" min="0" max="100" step="1" value={soundVolume}
            onChange={(event) => soundPicker.setSoundVolume(Number(event.target.value))}
            className="w-full accent-yellow-400" />
        </label>
        <label className="block space-y-1">
          <span className="flex justify-between text-xs text-white/70">
            <span>Voix / son original</span><span>{originalVolume}%</span>
          </span>
          <input type="range" min="0" max="100" step="1" value={originalVolume}
            onChange={(event) => soundPicker.setOriginalVolume(Number(event.target.value))}
            className="w-full accent-yellow-400" />
        </label>
      </div>
    )}
    {filterable && <EffectsPanel filter={filter} disabled={uploading} />}
    </div>
  );
}
