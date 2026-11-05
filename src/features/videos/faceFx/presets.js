import { makeRng } from "../filters/utils.js";

// Réglages de déformation (de -1 à +1, 0 = neutre).
export const FACE_PARAMS = [
  { id: "eyes", label: "Taille des yeux" },
  { id: "eyeDist", label: "Écart des yeux" },
  { id: "nose", label: "Taille du nez" },
  { id: "noseWidth", label: "Largeur du nez" },
  { id: "mouth", label: "Taille de la bouche" },
  { id: "mouthWidth", label: "Largeur de la bouche" },
  { id: "smile", label: "Sourire / moue" },
  { id: "cheeks", label: "Joues" },
  { id: "jaw", label: "Mâchoire" },
  { id: "chin", label: "Menton" },
  { id: "forehead", label: "Front" },
  { id: "faceWidth", label: "Largeur du visage" },
  { id: "faceLength", label: "Longueur du visage" },
];

export const BODY_PARAMS = [
  { id: "head", label: "Taille de la tête" },
  { id: "shoulders", label: "Épaules" },
  { id: "arms", label: "Bras" },
  { id: "waist", label: "Taille" },
  { id: "belly", label: "Ventre" },
  { id: "hips", label: "Hanches" },
  { id: "legs", label: "Jambes" },
];

export const SKIN_PARAMS = [
  { id: "age", label: "Âge (jeune ← → vieux)" },
  { id: "smooth", label: "Peau lisse", min: 0 },
];

export const ALL_PARAMS = [...FACE_PARAMS, ...BODY_PARAMS, ...SKIN_PARAMS];
export const BODY_IDS = new Set(BODY_PARAMS.map((p) => p.id));

export const FX_NONE = "none";
export const FX_RANDOM = "random";

export const FACE_FX_CATEGORIES = [
  { id: "age", emoji: "⏳", label: "Âge" },
  { id: "face", emoji: "🤪", label: "Visage" },
  { id: "body", emoji: "🕺", label: "Corps" },
  { id: "fun", emoji: "👽", label: "Délire" },
];

const fx = (cat, id, emoji, label, sw, p) => ({ id, cat, emoji, label, sw, p });

export const FACE_FX_PRESETS = [
  // Âge
  fx("age", "vieux", "👴", "Vieux", ["#c9b8a6", "#6b5a4a"], { age: 0.75, eyes: -0.1, mouthWidth: -0.1 }),
  fx("age", "tres-vieux", "🧓", "Très vieux", ["#d9d4cc", "#554a40"], { age: 1, eyes: -0.2, cheeks: -0.25, jaw: -0.15, smile: -0.2, nose: 0.15 }),
  fx("age", "mi-age", "🧔", "Quarante ans", ["#d8b89a", "#8a6a52"], { age: 0.35, eyes: -0.05 }),
  fx("age", "jeune", "🧑", "Rajeunir", ["#ffd9c7", "#e89b86"], { age: -0.8, smooth: 0.3 }),
  fx("age", "ado", "🧒", "Ado", ["#ffe0cc", "#f4a58f"], { age: -0.9, smooth: 0.4, eyes: 0.15, chin: -0.1 }),
  fx("age", "bebe", "👶", "Bébé", ["#ffe4d6", "#f9b1a0"], { age: -1, smooth: 0.5, eyes: 0.55, nose: -0.55, forehead: 0.45, chin: -0.45, mouth: -0.3, cheeks: 0.5, faceWidth: 0.15 }),
  fx("age", "peau-lisse", "✨", "Peau lisse", ["#fde9dd", "#f2b8a6"], { smooth: 0.9 }),
  // Visage
  fx("face", "gros-yeux", "👀", "Gros yeux", ["#bfe3ff", "#3b82f6"], { eyes: 0.85 }),
  fx("face", "petits-yeux", "😑", "Petits yeux", ["#d9d9d9", "#666"], { eyes: -0.8 }),
  fx("face", "gros-nez", "🤡", "Gros nez", ["#ffb3a7", "#d94a3a"], { nose: 0.9, noseWidth: 0.3 }),
  fx("face", "petit-nez", "🐽", "Petit nez", ["#ffd9d0", "#e6a090"], { nose: -0.8, noseWidth: -0.3 }),
  fx("face", "grand-sourire", "😁", "Grand sourire", ["#fff2a8", "#f59e0b"], { smile: 0.85, mouthWidth: 0.6, cheeks: 0.35 }),
  fx("face", "moue", "😞", "Moue", ["#c7cfe0", "#4b5a7a"], { smile: -0.8, mouthWidth: -0.2 }),
  fx("face", "bouche-geante", "👄", "Grosse bouche", ["#ffb3c1", "#e11d48"], { mouth: 0.9, mouthWidth: 0.4 }),
  fx("face", "menton-long", "🗿", "Menton long", ["#e2d6c7", "#8b7355"], { chin: 0.9, jaw: 0.3, faceLength: 0.3 }),
  fx("face", "visage-large", "🫓", "Visage large", ["#ffe8c2", "#d9922b"], { faceWidth: 0.85, cheeks: 0.4 }),
  fx("face", "visage-etroit", "🪒", "Visage étroit", ["#e8eef7", "#6a7fa8"], { faceWidth: -0.8, jaw: -0.4, faceLength: 0.25 }),
  fx("face", "joues-hamster", "🐹", "Joues rondes", ["#ffd7a8", "#e08a3c"], { cheeks: 1, jaw: 0.2, mouth: -0.2 }),
  fx("face", "front-geant", "🧠", "Grand front", ["#ffe6e6", "#d98a8a"], { forehead: 0.95, chin: -0.3 }),
  // Corps
  fx("body", "mince", "🧍", "Mince", ["#cfe8ff", "#4a7fc1"], { waist: -0.85, hips: -0.5, belly: -0.7, arms: -0.4 }),
  fx("body", "costaud", "💪", "Costaud", ["#ffd1a6", "#c2571a"], { shoulders: 0.8, arms: 0.8, waist: 0.2, head: -0.2 }),
  fx("body", "grosse-tete", "🎈", "Grosse tête", ["#ffe29a", "#f59e0b"], { head: 0.95 }),
  fx("body", "petite-tete", "📍", "Petite tête", ["#d8d8f0", "#6366f1"], { head: -0.85 }),
  fx("body", "longues-jambes", "🦵", "Longues jambes", ["#c9f0d8", "#16a34a"], { legs: 0.9, waist: -0.2 }),
  fx("body", "mannequin", "💃", "Mannequin", ["#f5d0fe", "#a21caf"], { legs: 0.7, waist: -0.7, shoulders: -0.2, head: -0.35, hips: 0.2 }),
  fx("body", "hulk", "🟢", "Hulk", ["#86efac", "#15803d"], { shoulders: 1, arms: 1, belly: 0.4, head: -0.45, waist: 0.3 }),
  fx("body", "ventre-rond", "🎃", "Gros ventre", ["#ffcf8a", "#d97706"], { belly: 1, hips: 0.3 }),
  // Délire
  fx("fun", "alien", "👽", "Alien", ["#a7f3a0", "#14532d"], { eyes: 0.95, eyeDist: 0.5, chin: -0.5, faceLength: 0.7, mouth: -0.7, nose: -0.8, forehead: 0.5 }),
  fx("fun", "caricature", "🎭", "Caricature", ["#ffd0a8", "#b45309"], { forehead: 0.7, nose: 0.8, chin: 0.8, eyes: -0.4, cheeks: 0.4, mouth: 0.4 }),
  fx("fun", "kawaii", "🥰", "Kawaii", ["#ffd6ec", "#ec4899"], { eyes: 0.7, nose: -0.6, mouth: -0.4, chin: -0.55, cheeks: 0.35, smooth: 0.7, age: -0.5 }),
  fx("fun", "zombie", "🧟", "Zombie", ["#b8c9a0", "#3f4f2a"], { age: 0.6, eyes: -0.3, cheeks: -0.9, jaw: -0.4, smile: -0.5, nose: -0.2 }),
  fx("fun", "poisson", "🐟", "Poisson", ["#9be7ff", "#0369a1"], { eyes: 0.6, eyeDist: 0.95, mouth: 0.6, mouthWidth: 0.6, nose: -0.9, faceWidth: 0.4 }),
  fx("fun", "tout-miniature", "🔬", "Mini visage", ["#e9d5ff", "#7e22ce"], { eyes: -0.5, nose: -0.5, mouth: -0.5, forehead: 0.4, cheeks: 0.5, chin: 0.3 }),
];

const BY_ID = new Map(FACE_FX_PRESETS.map((p) => [p.id, p]));
export const getFaceFxPreset = (id) => BY_ID.get(id) || null;
export const faceFxByCategory = (cat) => FACE_FX_PRESETS.filter((p) => p.cat === cat);

// Un entier → un jeu de déformations unique : il y en a donc une infinité.
export function generateParams(seed) {
  const rng = makeRng(seed * 2654435761 || 1);
  const out = {};
  const pick = (list, chance, spread) => {
    list.forEach((p) => {
      if (rng() < chance) out[p.id] = +((rng() * 2 - 1) * spread).toFixed(2);
    });
  };
  pick(FACE_PARAMS, 0.4, 0.95);
  if (Object.keys(out).length < 3) {
    for (let i = 0; i < 3; i += 1) out[FACE_PARAMS[Math.floor(rng() * FACE_PARAMS.length)].id] = +((rng() * 2 - 1) * 0.9).toFixed(2);
  }
  if (rng() < 0.3) out.age = +((rng() * 2 - 1) * 0.9).toFixed(2);
  if (rng() < 0.18) pick(BODY_PARAMS, 0.5, 0.9);
  return out;
}

export function describeFaceFx(state) {
  if (!state || state.id === FX_NONE) return { label: "Aucun effet", emoji: "🚫", sw: ["#3f3f46", "#18181b"] };
  if (state.id === FX_RANDOM) return { label: `Mutation #${state.seed}`, emoji: "🧬", sw: ["#f0abfc", "#6d28d9"] };
  const p = getFaceFxPreset(state.id);
  return p ? { label: p.label, emoji: p.emoji, sw: p.sw } : { label: "Aucun effet", emoji: "🚫", sw: ["#3f3f46", "#18181b"] };
}
