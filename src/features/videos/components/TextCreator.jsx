import { COLORS } from "../../../theme.js";
import { TEXT_THEMES } from "../constants.js";

// Onglet « Texte » : message sur fond dégradé converti en vidéo.
export default function TextCreator({ creator }) {
  const {
    textTheme,
    textContent,
    setTextContent,
    setTextTheme,
    handleGenerate,
    generating,
    generateProgress,
  } = creator;

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-3xl overflow-hidden aspect-[9/14] max-h-[40dvh] mx-auto flex items-center justify-center p-6 text-center"
        style={{
          background: `linear-gradient(135deg, ${TEXT_THEMES[textTheme][0]}, ${TEXT_THEMES[textTheme][1]})`,
        }}
      >
        <p className="font-black text-xl leading-tight break-words whitespace-pre-wrap">
          {textContent.trim() || "Ton texte apparaîtra ici"}
        </p>
      </div>

      <textarea
        value={textContent}
        onChange={(event) => setTextContent(event.target.value)}
        placeholder="Écris ton message…"
        rows={3}
        maxLength={280}
        className="w-full rounded-2xl bg-white/10 px-4 py-3 outline-none text-sm resize-none"
      />

      <div className="flex items-center gap-3">
        {TEXT_THEMES.map(([c1, c2], index) => (
          <button
            key={index}
            onClick={() => setTextTheme(index)}
            className="h-9 w-9 rounded-full border-2"
            style={{
              background: `linear-gradient(135deg, ${c1}, ${c2})`,
              borderColor: textTheme === index ? "#fff" : "transparent",
            }}
            aria-label={`Couleur ${index + 1}`}
          />
        ))}
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating || !textContent.trim()}
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
