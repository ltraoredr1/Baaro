import { X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { formatTime } from "../utils/format.js";

// Plein écran caméra ; camera = retour de useCamera.
export default function CameraOverlay({ camera }) {
  const {
    closeCamera,
    cameraSeconds,
    toggleCameraFacing,
    cameraRecording,
    cameraVideoRef,
    cameraFacing,
    cameraError,
    stopCameraRecording,
    startCameraRecording,
    startCamera,
  } = camera;

  return (
    <div className="fixed inset-0 z-[120] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={closeCamera}
          className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center"
          aria-label="Fermer la caméra"
        >
          <X size={20} />
        </button>
        <div className="text-center">
          <div className="font-black">Caméra BAARO</div>
          <div className="text-xs text-white/50">
            {formatTime(cameraSeconds)}
          </div>
        </div>
        <button
          onClick={toggleCameraFacing}
          disabled={cameraRecording}
          className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-40"
          aria-label="Changer de caméra"
        >
          🔄
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <div className="relative w-full max-w-md h-full max-h-[78dvh] rounded-3xl overflow-hidden bg-zinc-950">
          <video
            ref={cameraVideoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{
              transform: cameraFacing === "user" ? "scaleX(-1)" : "none",
            }}
          />
          {cameraError && (
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/75 border border-red-400/30 p-4 text-sm text-center">
              {cameraError}
            </div>
          )}
          {cameraRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-bold">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              REC · {formatTime(cameraSeconds)}
            </div>
          )}
        </div>
      </div>

      <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3">
        {!cameraError && (
          <button
            onClick={
              cameraRecording ? stopCameraRecording : startCameraRecording
            }
            className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95"
            aria-label={
              cameraRecording
                ? "Arrêter l'enregistrement"
                : "Démarrer l'enregistrement"
            }
          >
            <span
              className={
                cameraRecording
                  ? "h-8 w-8 rounded-lg bg-red-500"
                  : "h-16 w-16 rounded-full bg-red-500"
              }
            />
          </button>
        )}
        {cameraError && (
          <button
            onClick={startCamera}
            className="rounded-2xl px-5 py-3 font-black"
            style={{ background: COLORS.gold, color: "#000" }}
          >
            Réessayer la caméra
          </button>
        )}
      </div>
    </div>
  );
}
