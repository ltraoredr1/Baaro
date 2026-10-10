import { X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import CameraOverlay from "./CameraOverlay.jsx";
import CreatorPanel from "./CreatorPanel.jsx";
import SoundPicker from "./SoundPicker.jsx";
import UploadPreview from "./UploadPreview.jsx";

// Fenêtre « Nouvelle vidéo » : médias, titre, description, son, publication.
export default function UploadModal({ creator, soundPicker, camera }) {
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
            onClick={() => {
              if (!uploading) {
                closeCamera();
                setShowUpload(false);
                resetUpload();
              }
            }}
            className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
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
            onChange={(event) => handleFileSelected(event.target.files?.[0])}
          />

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
            disabled={uploading || !selectedFile}
            onClick={handleUpload}
            className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            {uploading ? "Publication en cours…" : "Publier la vidéo"}
          </button>
        </div>
      </div>
    </div>
  );
}
