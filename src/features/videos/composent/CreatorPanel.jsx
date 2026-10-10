import PhotoCreator from "./PhotoCreator.jsx";
import TextCreator from "./TextCreator.jsx";
import VideoSource from "./VideoSource.jsx";

// Choix du mode de création : vidéo, photos ou texte.
export default function CreatorPanel({ creator, camera }) {
  const { createMode, setCreateMode } = creator;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/5">
        {[
          ["video", "🎬 Vidéo"],
          ["photo", "🖼️ Photos"],
          ["text", "✍️ Texte"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCreateMode(key)}
            className={`py-2 rounded-xl text-xs font-bold ${
              createMode === key ? "bg-white text-black" : "text-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {createMode === "video" && (
        <VideoSource creator={creator} camera={camera} />
      )}
      {createMode === "photo" && <PhotoCreator creator={creator} />}
      {createMode === "text" && <TextCreator creator={creator} />}
    </div>
  );
}
