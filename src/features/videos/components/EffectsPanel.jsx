import { useState } from "react";
import FaceFxPicker from "./FaceFxPicker.jsx";
import FilterPicker from "./FilterPicker.jsx";

// Panneau unique : « Filtres » (ambiances, infinies) et « Visage & corps » (déformations, âge).
// filter = objet fusionné de VideosTab { ...useVideoFilter(), face: useFaceFx(), anyActive, reset }.
export default function EffectsPanel({ filter, disabled = false, faceEnabled = true, className = "" }) {
  const [tab, setTab] = useState("filters");
  const showFace = faceEnabled && !!filter?.face;
  const current = showFace ? tab : "filters";

  return (
    <div className={`space-y-3 ${className}`}>
      {showFace && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
          {[
            ["filters", "🎨 Filtres", filter.active],
            ["face", "🧬 Visage & corps", filter.face.active],
          ].map(([id, label, on]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-xl py-2 text-xs font-bold ${current === id ? "bg-white text-black" : "text-white/60"}`}
            >
              {label}
              {on ? " •" : ""}
            </button>
          ))}
        </div>
      )}
      {current === "filters" ? (
        <FilterPicker filter={filter} disabled={disabled} />
      ) : (
        <FaceFxPicker fx={filter.face} disabled={disabled} />
      )}
    </div>
  );
}
