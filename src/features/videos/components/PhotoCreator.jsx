import { Plus, X } from "lucide-react";
import { COLORS } from "../../../theme.js";
import { MAX_PHOTOS } from "../constants.js";

// Onglet « Photos » : diaporama converti en vidéo.
export default function PhotoCreator({ creator }) {
  const {
    photoInputRef,
    handlePhotosSelected,
    photoFiles,
    removePhoto,
    photoSeconds,
    setPhotoSeconds,
    handleGenerate,
    generating,
    generateProgress,
  } = creator;

  return (
    <div className="space-y-3">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          handlePhotosSelected(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        onClick={() => photoInputRef.current?.click()}
        className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.04] py-8 flex flex-col items-center gap-2"
      >
        <Plus size={22} />
        <span className="text-sm font-bold">
          Ajouter des photos ({photoFiles.length}/{MAX_PHOTOS})
        </span>
      </button>

      {photoFiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photoFiles.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800"
            >
              <img
                src={item.url}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                onClick={() => removePhoto(item.id)}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center"
                aria-label="Retirer la photo"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-sm">
        <span>Durée par photo</span>
        <select
          value={photoSeconds}
          onChange={(event) => setPhotoSeconds(Number(event.target.value))}
          className="bg-transparent outline-none font-bold"
        >
          {[2, 3, 5].map((n) => (
            <option key={n} value={n} className="text-black">
              {n} s
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || !photoFiles.length}
        className="w-full py-3.5 rounded-2xl font-black disabled:opacity-40"
        style={{ background: COLORS.gold, color: "#000" }}
      >
        {generating
          ? `Création… ${Math.round(generateProgress * 100)}%`
          : "Créer la vidéo"}
      </button>
      <p className="text-[10px] text-white/40 text-center">
        Choisis ta musique ci-dessous, puis crée. Reste sur cet écran pendant la
        création.
      </p>
    </div>
  );
}
