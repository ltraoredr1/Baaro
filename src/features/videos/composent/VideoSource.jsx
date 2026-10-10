import { Plus } from "lucide-react";
import { COLORS } from "../../../theme.js";

// Onglet « Vidéo » : filmer avec la caméra ou choisir un fichier.
export default function VideoSource({ creator, camera }) {
  const { fileInputRef } = creator;
  const { openCamera } = camera;

  return (
    <div className="space-y-3">
      <button
        onClick={openCamera}
        className="w-full aspect-[9/14] max-h-[52dvh] rounded-3xl border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center active:scale-[0.99]"
        style={{ boxShadow: `inset 0 0 0 1px ${COLORS.gold}33` }}
      >
        <div
          className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
          style={{ background: COLORS.gold, color: "#000" }}
        >
          <span className="text-3xl">📹</span>
        </div>
        <p className="font-black text-lg">Filmer avec la caméra</p>
        <p className="text-xs text-white/40 mt-1 px-6 text-center">
          Caméra + micro · aucune limite de durée imposée par BAARO
        </p>
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold"
      >
        <Plus size={18} />
        Choisir une vidéo dans la galerie
      </button>
    </div>
  );
}
