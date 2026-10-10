// Aperçu de la vidéo choisie ou générée, avant publication.
export default function UploadPreview({ creator, soundPicker }) {
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
  } = creator;
  const { muteOriginal, selectedSound, stopSoundPreview } = soundPicker;

  return (
    <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/14] max-h-[52dvh]">
      <video
        ref={previewVideoRef}
        src={previewUrl}
        controls
        playsInline
        muted={muteOriginal && !!selectedSound?.audio_url && !bakedAudio}
        className="h-full w-full object-contain"
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
  );
}
