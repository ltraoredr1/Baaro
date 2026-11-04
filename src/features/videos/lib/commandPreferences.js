const STORAGE_KEY = "baaro:command-prefs-v1";

export const DEFAULT_GESTURE_MAP = {
  thumbUp: "like",
  openPalm: "toggle-play",
  swipeLeft: "next",
  swipeRight: "previous",
  headLeft: "next",
  headRight: "previous",
  headUpDown: "toggle-play",
};

export const DEFAULT_VOICE_MAP = {
  next: ["suivante", "suivant", "next", "video suivante"],
  previous: ["precedente", "precedent", "previous", "video precedente"],
  like: ["jaime", "j aime", "like", "aimer"],
  pause: ["pause", "arrete", "stop"],
  resume: ["reprendre", "reprise", "continue", "relance"],
  mute: ["couper le son", "muet", "desactiver le son"],
  unmute: ["activer le son", "remettre le son", "son"],
  comments: ["commentaires", "ouvrir les commentaires"],
  fullscreen: ["plein ecran", "agrandir"],
};

export const ACTION_LABELS = {
  like: "J'aime",
  "toggle-play": "Pause / Reprise",
  next: "Vidéo suivante",
  previous: "Vidéo précédente",
  mute: "Couper le son",
  unmute: "Activer le son",
  comments: "Commentaires",
  fullscreen: "Plein écran",
  none: "Aucune action",
};

export const GESTURE_LABELS = {
  thumbUp: "👍 Pouce en l'air",
  openPalm: "✋ Paume ouverte",
  swipeLeft: "👈 Glisser main gauche",
  swipeRight: "👉 Glisser main droite",
  headLeft: "⬅️ Tête à gauche",
  headRight: "➡️ Tête à droite",
  headUpDown: "↕️ Tête haut / bas",
};

const DEFAULTS = {
  gestureMap: { ...DEFAULT_GESTURE_MAP },
  voiceEnabledByDefault: false,
  cameraEnabledByDefault: false,
  cooldownMs: 1400,
  soundOnGesture: true, // innovant : petit feedback sonore sur geste
};

export function loadCommandPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      gestureMap: { ...DEFAULT_GESTURE_MAP, ...(raw.gestureMap || {}) },
      voiceEnabledByDefault: !!raw.voiceEnabledByDefault,
      cameraEnabledByDefault: !!raw.cameraEnabledByDefault,
      cooldownMs: Number(raw.cooldownMs) > 400 ? Number(raw.cooldownMs) : 1400,
      soundOnGesture: raw.soundOnGesture !== false,
    };
  } catch {
    return { ...DEFAULTS, gestureMap: { ...DEFAULT_GESTURE_MAP } };
  }
}

export function saveCommandPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

export function resetCommandPrefs() {
  saveCommandPrefs(DEFAULTS);
  return { ...DEFAULTS, gestureMap: { ...DEFAULT_GESTURE_MAP } };
}
