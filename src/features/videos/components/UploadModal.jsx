import { Leaf, X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import CameraOverlay from "./CameraOverlay.jsx";
import CreatorPanel from "./CreatorPanel.jsx";
import SoundPicker from "./SoundPicker.jsx";
import UploadPreview from "./UploadPreview.jsx";

// Fenêtre « Nouvelle vidéo » : médias, titre, description, son, publication.
// compression : { compressing, progress, cancel, abort } (useVideoCompression)
export default function UploadModal({
  creator,
  soundPicker,
  camera,
  compression,
  compressUploads = false,
  onCompressChange,
}) {
  const {
    showUpload,
    setShowUpload,
    selectedFile,
    uploadTitle,
    setUploadTitle,
    uploadDescription,
    setUploadDescription,
    uploading,
    uploadProgress,
    bakedAudio,
    fileInputRef,
    handleFileSelected,
    handleUpload,
    resetUpload,
  } = creator;
  const { cameraOpen, closeCamera } = camera;

  if (!showUpload) return null;

  const compressing = !!compression?.compressing;
  const busy = uploading || compressing;

  const handleClose = () => {
    if (uploading) return;

    // Fermer pendant l'optimisation : on abandonne aussi le fichier.
    compression?.abort?.();
    closeCamera();
    setShowUpload(false);
    resetUpload();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      {cameraOpen && <CameraOverlay camera={camera} />}
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-white/10">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-zinc-950/95 backdrop-blur border-b border-white/10">
          <div>
            <h3 className="font-black text-lg">Nouvelle vidéo</h3>
            <p className="text-[10px] text-white/40">
              Publie ton contenu sur BAARO
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={handleClose}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {compressing && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                  <Leaf size={14} /> Optimisation de la vidéo…
                </span>
                <span>{compression.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${compression.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-white/45">
                  Gardez l'application ouverte. Plus léger = envoi plus rapide
                  et moins de data pour vos abonnés.
                </p>
                <button
                  type="button"
                  onClick={compression.cancel}
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold"
                >
                  Ignorer
                </button>
              </div>
            </div>
          )}

          {!selectedFile ? (
            <CreatorPanel creator={creator} camera={camera} />
          ) : (
            <UploadPreview creator={creator} soundPicker={soundPicker} />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              handleFileSelected(event.target.files?.[0]);
              // permet de re-choisir le même fichier après une annulation
              event.target.value = "";
            }}
          />

          {onCompressChange && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Leaf size={14} className="text-emerald-400" />
                  Alléger la vidéo avant l'envoi
                </div>
                <div className="text-[11px] text-white/40">
                  Vidéos de plus de 10 Mo et de moins de 3 min, en 720p+ MP4.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={compressUploads}
                aria-label="Alléger la vidéo avant l'envoi"
                disabled={busy}
                onClick={() => onCompressChange(!compressUploads)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                  compressUploads ? "bg-yellow-400" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    compressUploads ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          <input
            value={uploadTitle}
            onChange={(event) => setUploadTitle(event.target.value)}
            placeholder="Titre de la vidéo"
            maxLength={120}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm"
          />

          <textarea
            value={uploadDescription}
            onChange={(event) => setUploadDescription(event.target.value)}
            placeholder="Description…"
            rows={3}
            maxLength={500}
            className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
          />

          <SoundPicker
            soundPicker={soundPicker}
            hasFile={!!selectedFile}
            bakedAudio={bakedAudio}
          />

          {uploading && (
            <div>
              <div className="flex justify-between text-xs mb-2">
                <span>Publication…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${uploadProgress}%`,
                    background: COLORS.gold,
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={busy || !selectedFile}
            onClick={handleUpload}
            className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            {uploading
              ? "Publication en cours…"
              : compressing
              ? "Optimisation en cours…"
              : "Publier la vidéo"}
          </button>
        </div>
      </div>
    </div>
  );
}
