// Catalogue des filtres BAARO. Chaque filtre est une « recette » (réglages d'image,
// teinte, dégradé, vignette, grain, effets animés). Le moteur en tire une infinité
// de variantes (graine, teinte, intensité, densité) : voir filterEngine.js.
//
// adjust   : réglages de couleur de l'image (équivalent CSS filter)
// tint     : voile de couleur uniforme   { color, alpha, mode }
// gradient : dégradé vertical            { top, bottom | stops, alpha, mode }
// effects  : particules / ambiances animées (voir effects.js)

export const FILTER_CATEGORIES = [
  { id: "ocean", emoji: "🌊", label: "Océan" },
  { id: "space", emoji: "🚀", label: "Espace" },
  { id: "beyond", emoji: "👻", label: "Au-delà" },
  { id: "sky", emoji: "🌅", label: "Ciel & Feu" },
  { id: "nature", emoji: "🌿", label: "Nature" },
  { id: "neon", emoji: "⚡", label: "Néon" },
  { id: "retro", emoji: "🎞️", label: "Rétro" },
  { id: "dream", emoji: "✨", label: "Rêve & Fête" },
  { id: "winter", emoji: "❄️", label: "Hiver" },
];

const fx = (type, over = {}) => ({ type, ...over });

const preset = (cat, id, emoji, label, sw, recipe) => ({
  id,
  cat,
  emoji,
  label,
  sw,
  ...recipe,
});

export const FILTER_PRESETS = [
  // ───────────────────────── Océan ─────────────────────────
  preset("ocean", "lagon", "🏝️", "Lagon", ["#00e5ff", "#0077b6"], {
    adjust: { brightness: 1.06, saturate: 1.4, hue: -6 },
    tint: { color: "#00cfff", alpha: 0.2, mode: "soft-light" },
    gradient: { top: "#c8fbff", bottom: "#0090c8", alpha: 0.22, mode: "soft-light" },
    vignette: 0.15,
    effects: [fx("rays", { count: 5, alpha: 0.3 }), fx("bubbles", { count: 14 }), fx("ripples", { count: 6, alpha: 0.18 })],
  }),
  preset("ocean", "abysses", "🌑", "Abysses", ["#0b3d91", "#00040f"], {
    adjust: { brightness: 0.82, contrast: 1.18, saturate: 1.15, hue: 8 },
    tint: { color: "#001b4d", alpha: 0.5, mode: "multiply" },
    gradient: { top: "#0b3d91", bottom: "#00040f", alpha: 0.5, mode: "multiply" },
    vignette: 0.65,
    effects: [fx("bubbles", { count: 26, alpha: 0.5, color: "#8fd6ff" }), fx("fish", { count: 6 }), fx("dust", { count: 60, color: "#8fd6ff", alpha: 0.35 })],
  }),
  preset("ocean", "recif", "🐠", "Récif corail", ["#ff7a59", "#0b6fa8"], {
    adjust: { brightness: 1.04, contrast: 1.08, saturate: 1.65 },
    tint: { color: "#ff7a59", alpha: 0.12, mode: "overlay" },
    gradient: { top: "#7ef3ff", bottom: "#0b6fa8", alpha: 0.2, mode: "soft-light" },
    effects: [fx("rays", { count: 4, alpha: 0.25 }), fx("bubbles"), fx("fish", { count: 9, color: "#ff7a00", alpha: 0.85 })],
  }),
  preset("ocean", "surface", "💧", "Sous la surface", ["#2bb8d8", "#06577a"], {
    adjust: { brightness: 1.02, saturate: 1.25, hue: -10 },
    tint: { color: "#2bb8d8", alpha: 0.25, mode: "soft-light" },
    vignette: 0.2,
    effects: [fx("ripples", { count: 9, alpha: 0.3 }), fx("rays", { count: 7, alpha: 0.4 }), fx("waves", { count: 2, alpha: 0.2 })],
  }),
  preset("ocean", "vague", "🏄", "Grande vague", ["#4de1ff", "#0a4d8c"], {
    adjust: { brightness: 1.04, contrast: 1.1, saturate: 1.35 },
    tint: { color: "#0aa4d8", alpha: 0.18, mode: "soft-light" },
    effects: [fx("waves", { count: 4, alpha: 0.45 }), fx("bubbles", { count: 12 }), fx("fog", { count: 4, alpha: 0.1 })],
  }),
  preset("ocean", "bioluminescence", "🪼", "Bioluminescence", ["#3ff3ff", "#001a3a"], {
    adjust: { brightness: 0.8, contrast: 1.25, saturate: 1.4, hue: 6 },
    tint: { color: "#002a5c", alpha: 0.45, mode: "multiply" },
    vignette: 0.55,
    effects: [fx("fireflies", { count: 34, color: "#3ff3ff", size: [0.01, 0.035] }), fx("spirits", { count: 8, color: "#5ad7ff", alpha: 0.35 }), fx("bubbles", { count: 10, color: "#7fe9ff", alpha: 0.4 })],
  }),
  preset("ocean", "sirene", "🧜", "Sirène", ["#7cf5e0", "#7a4cff"], {
    adjust: { brightness: 1.05, saturate: 1.35, hue: 24 },
    tint: { color: "#9b6bff", alpha: 0.18, mode: "soft-light" },
    gradient: { top: "#7cf5e0", bottom: "#7a4cff", alpha: 0.25, mode: "soft-light" },
    effects: [fx("bubbles", { color: "#e0d4ff" }), fx("sparkles", { count: 30, color: "#eafffb" }), fx("rays", { count: 4, color: "#d9fff5", alpha: 0.25 })],
  }),
  preset("ocean", "tempete-mer", "⛈️", "Tempête en mer", ["#1d3557", "#0b1320"], {
    adjust: { brightness: 0.85, contrast: 1.2, saturate: 0.85, hue: -5 },
    tint: { color: "#1d3557", alpha: 0.35, mode: "multiply" },
    vignette: 0.5,
    effects: [fx("rain", { count: 130, alpha: 0.45 }), fx("waves", { count: 3, alpha: 0.4, color: "#0f4c75" }), fx("lightning")],
  }),

  // ───────────────────────── Espace ─────────────────────────
  preset("space", "nebuleuse", "🌌", "Nébuleuse", ["#a855f7", "#0ea5e9"], {
    adjust: { brightness: 0.92, contrast: 1.15, saturate: 1.4 },
    tint: { color: "#4c1d95", alpha: 0.3, mode: "overlay" },
    vignette: 0.4,
    effects: [fx("nebula", { count: 6 }), fx("stars", { count: 110 })],
  }),
  preset("space", "galaxie", "🌠", "Galaxie", ["#60a5fa", "#0b1d5e"], {
    adjust: { brightness: 0.88, contrast: 1.2, saturate: 1.3, hue: -12 },
    tint: { color: "#0b1d5e", alpha: 0.4, mode: "multiply" },
    effects: [fx("nebula", { count: 4, color: "#60a5fa", color2: "#f472b6", alpha: 0.3 }), fx("stars", { count: 160, size: [0.0015, 0.005] }), fx("shooting", { count: 3 })],
  }),
  preset("space", "saturne", "🪐", "Saturne", ["#e9c98a", "#1b1035"], {
    adjust: { brightness: 0.9, contrast: 1.15, saturate: 1.2 },
    tint: { color: "#1b1035", alpha: 0.35, mode: "multiply" },
    effects: [fx("stars", { count: 100 }), fx("planet"), fx("nebula", { count: 2, alpha: 0.2 })],
  }),
  preset("space", "aurore", "💚", "Aurore boréale", ["#4ade80", "#a78bfa"], {
    adjust: { brightness: 0.9, contrast: 1.15, saturate: 1.35 },
    tint: { color: "#042a2b", alpha: 0.35, mode: "multiply" },
    effects: [fx("aurora", { count: 3 }), fx("stars", { count: 90 })],
  }),
  preset("space", "trou-noir", "⚫", "Trou noir", ["#ffb347", "#000000"], {
    adjust: { brightness: 0.75, contrast: 1.35, saturate: 1.2 },
    tint: { color: "#000000", alpha: 0.35, mode: "multiply" },
    vignette: 0.8,
    effects: [fx("portal", { count: 8, color: "#ffb347", color2: "#ff4e50", size: [0.08, 0.5], alpha: 0.8 }), fx("stars", { count: 70 })],
  }),
  preset("space", "supernova", "💥", "Supernova", ["#ff7849", "#ffd166"], {
    adjust: { brightness: 1.1, contrast: 1.25, saturate: 1.5 },
    tint: { color: "#ff5a1f", alpha: 0.3, mode: "overlay" },
    effects: [fx("nebula", { count: 5, color: "#ff7849", color2: "#ffd166", alpha: 0.38 }), fx("sparkles", { count: 50 }), fx("shooting", { count: 5, color: "#ffe6b3" })],
  }),
  preset("space", "mars", "🔴", "Mars", ["#ffb88c", "#7b2d12"], {
    adjust: { sepia: 0.4, saturate: 1.5, hue: -18, contrast: 1.1 },
    tint: { color: "#c1440e", alpha: 0.3, mode: "soft-light" },
    gradient: { top: "#ffb88c", bottom: "#7b2d12", alpha: 0.25, mode: "soft-light" },
    vignette: 0.3,
    effects: [fx("dust", { count: 120, color: "#ffb88c", alpha: 0.45 }), fx("fog", { count: 5, color: "#d0643a", alpha: 0.12 })],
  }),
  preset("space", "voie-lactee", "✨", "Voie lactée", ["#c4b5fd", "#0a1642"], {
    adjust: { brightness: 0.9, contrast: 1.25, saturate: 1.2 },
    tint: { color: "#0a1642", alpha: 0.4, mode: "multiply" },
    effects: [fx("nebula", { count: 3, color: "#c4b5fd", color2: "#fda4af", alpha: 0.22, size: [0.5, 0.9] }), fx("stars", { count: 220, size: [0.0012, 0.004] }), fx("shooting", { count: 2 })],
  }),

  // ───────────────────────── Au-delà ─────────────────────────
  preset("beyond", "paradis", "😇", "Paradis", ["#fff7d6", "#ffd98a"], {
    adjust: { brightness: 1.12, contrast: 0.95, saturate: 0.95, blur: 0.4 },
    tint: { color: "#fff1c1", alpha: 0.3, mode: "soft-light" },
    gradient: { top: "#ffffff", bottom: "#ffe9a8", alpha: 0.25, mode: "screen" },
    effects: [fx("rays", { count: 7, color: "#fff7d6", alpha: 0.5 }), fx("halo", { color: "#fff4c9" }), fx("sparkles", { count: 36, color: "#fffbe6" }), fx("petals", { count: 16, color: "#ffffff", color2: "#fff2cc", alpha: 0.7 })],
  }),
  preset("beyond", "esprits", "👻", "Esprits", ["#bfe9ff", "#3a5f7a"], {
    adjust: { brightness: 0.9, contrast: 1.1, saturate: 0.55, hue: -14 },
    tint: { color: "#3a5f7a", alpha: 0.35, mode: "soft-light" },
    vignette: 0.5,
    effects: [fx("spirits", { count: 16 }), fx("fog", { count: 6, alpha: 0.14 }), fx("dust", { count: 40, color: "#cfeaff" })],
  }),
  preset("beyond", "purgatoire", "🌫️", "Purgatoire", ["#d6d6e0", "#4a4a56"], {
    adjust: { brightness: 0.88, contrast: 1.12, saturate: 0.3, sepia: 0.2 },
    tint: { color: "#6b6b78", alpha: 0.35, mode: "overlay" },
    vignette: 0.7,
    effects: [fx("fog", { count: 9, alpha: 0.2 }), fx("spirits", { count: 8, color: "#d6d6e0", alpha: 0.35 }), fx("dust", { count: 50, color: "#cfcfd8", alpha: 0.4 })],
  }),
  preset("beyond", "enfer", "🔥", "Enfer", ["#ff4500", "#1a0000"], {
    adjust: { brightness: 0.9, contrast: 1.3, saturate: 1.4, hue: -8 },
    tint: { color: "#c1121f", alpha: 0.35, mode: "overlay" },
    gradient: { top: "#1a0000", bottom: "#ff4500", alpha: 0.35, mode: "soft-light" },
    vignette: 0.7,
    effects: [fx("flames", { count: 14 }), fx("embers", { count: 55 }), fx("fog", { count: 4, color: "#ff3b1f", alpha: 0.12 })],
  }),
  preset("beyond", "portail", "🌀", "Portail mystique", ["#c084fc", "#3b0764"], {
    adjust: { brightness: 0.9, contrast: 1.2, saturate: 1.4, hue: 10 },
    tint: { color: "#3b0764", alpha: 0.35, mode: "overlay" },
    vignette: 0.55,
    effects: [fx("portal", { count: 8 }), fx("sparkles", { count: 34, color: "#e9d5ff" }), fx("spirits", { count: 8, color: "#c084fc", alpha: 0.35 })],
  }),
  preset("beyond", "hante", "🏚️", "Maison hantée", ["#e2fff4", "#1b2a2a"], {
    adjust: { brightness: 0.78, contrast: 1.3, saturate: 0.4, blur: 0.3 },
    tint: { color: "#1b2a2a", alpha: 0.4, mode: "multiply" },
    vignette: 0.75,
    grain: 0.35,
    effects: [fx("glitch", { count: 2, alpha: 0.5 }), fx("spirits", { count: 6, color: "#e2fff4", alpha: 0.4 }), fx("fog", { count: 7, alpha: 0.18 })],
  }),
  preset("beyond", "ange", "👼", "Ange gardien", ["#ffffff", "#bcd7ff"], {
    adjust: { brightness: 1.1, saturate: 1.05, blur: 0.5 },
    tint: { color: "#e8f1ff", alpha: 0.2, mode: "screen" },
    effects: [fx("halo", { size: [0.8, 0.8], alpha: 0.6, color: "#ffffff" }), fx("petals", { count: 22, color: "#ffffff", color2: "#e8f1ff", alpha: 0.75 }), fx("sparkles", { count: 24, color: "#ffffff" })],
  }),
  preset("beyond", "ancetres", "🕯️", "Ancêtres", ["#ffd27a", "#5a3a10"], {
    adjust: { sepia: 0.45, brightness: 0.92, contrast: 1.15, saturate: 1.2 },
    tint: { color: "#c98a1b", alpha: 0.3, mode: "soft-light" },
    vignette: 0.6,
    grain: 0.25,
    effects: [fx("spirits", { count: 12, color: "#ffd27a", alpha: 0.5 }), fx("dust", { count: 80, color: "#ffe2a6", alpha: 0.5 }), fx("embers", { count: 20, alpha: 0.6 })],
  }),
  preset("beyond", "lune-mystique", "🌙", "Lune mystique", ["#dbeafe", "#1e3a8a"], {
    adjust: { brightness: 0.88, contrast: 1.15, saturate: 0.8, hue: -18 },
    tint: { color: "#1e3a8a", alpha: 0.3, mode: "multiply" },
    vignette: 0.5,
    effects: [fx("halo", { color: "#dbeafe", size: [0.6, 0.6] }), fx("fog", { count: 6, alpha: 0.14 }), fx("fireflies", { count: 12, color: "#bfdbfe" })],
  }),

  // ───────────────────────── Ciel & Feu ─────────────────────────
  preset("sky", "couchant", "🌇", "Coucher de soleil", ["#ff8a00", "#7a2cff"], {
    adjust: { brightness: 1.05, saturate: 1.4, contrast: 1.05, hue: -6 },
    tint: { color: "#ff7a18", alpha: 0.3, mode: "soft-light" },
    gradient: { top: "#7a2cff", bottom: "#ff8a00", alpha: 0.3, mode: "soft-light" },
    vignette: 0.3,
    effects: [fx("dust", { count: 40, color: "#ffd9a0" }), fx("bokeh", { count: 8, color: "#ffb347", alpha: 0.2 })],
  }),
  preset("sky", "aube", "🌅", "Aube dorée", ["#ffe6a8", "#ff9d5c"], {
    adjust: { brightness: 1.08, saturate: 1.2, sepia: 0.12 },
    tint: { color: "#ffd27a", alpha: 0.25, mode: "soft-light" },
    gradient: { top: "#ffe6a8", bottom: "#ff9d5c", alpha: 0.25, mode: "soft-light" },
    effects: [fx("rays", { count: 6, color: "#fff0c0", alpha: 0.38 }), fx("dust", { count: 60, color: "#fff1c9" })],
  }),
  preset("sky", "orage", "⛈️", "Orage", ["#1c2b4a", "#0a1020"], {
    adjust: { brightness: 0.85, contrast: 1.25, saturate: 0.8 },
    tint: { color: "#1c2b4a", alpha: 0.4, mode: "multiply" },
    vignette: 0.5,
    effects: [fx("rain", { count: 140 }), fx("lightning"), fx("fog", { count: 5, alpha: 0.15, color: "#9fb0cc" })],
  }),
  preset("sky", "volcan", "🌋", "Volcan", ["#ff6a00", "#2b0a0a"], {
    adjust: { brightness: 0.92, contrast: 1.3, saturate: 1.5, hue: -10 },
    tint: { color: "#d62828", alpha: 0.3, mode: "overlay" },
    gradient: { top: "#2b0a0a", bottom: "#ff6a00", alpha: 0.35, mode: "soft-light" },
    vignette: 0.6,
    effects: [fx("embers", { count: 70 }), fx("flames", { count: 10, alpha: 0.5 }), fx("fog", { count: 4, color: "#5a2a1a", alpha: 0.2 })],
  }),
  preset("sky", "feu-camp", "🏕️", "Feu de camp", ["#ff8a3c", "#2a1305"], {
    adjust: { sepia: 0.25, brightness: 0.95, contrast: 1.15, saturate: 1.3 },
    tint: { color: "#ff8a3c", alpha: 0.28, mode: "soft-light" },
    vignette: 0.65,
    effects: [fx("embers", { count: 40 }), fx("dust", { count: 40, color: "#ffcf9a" })],
  }),
  preset("sky", "arc-en-ciel", "🌈", "Arc-en-ciel", ["#ff4d4d", "#8a4dff"], {
    adjust: { saturate: 1.5, brightness: 1.05 },
    gradient: { stops: ["#ff4d4d", "#ffd24d", "#4dff88", "#4dc3ff", "#8a4dff"], alpha: 0.3, mode: "soft-light" },
    effects: [fx("sparkles", { count: 24 }), fx("bokeh", { count: 8, alpha: 0.2 })],
  }),
  preset("sky", "plein-soleil", "☀️", "Plein soleil", ["#fff3b0", "#ffb300"], {
    adjust: { brightness: 1.12, contrast: 1.12, saturate: 1.35 },
    tint: { color: "#fff3b0", alpha: 0.2, mode: "soft-light" },
    effects: [fx("rays", { count: 5, color: "#fffbe0" }), fx("bokeh", { count: 8, color: "#fff0a8", alpha: 0.22 })],
  }),
  preset("sky", "nuit-etoilee", "🌃", "Nuit étoilée", ["#0c1a4b", "#3b4ea8"], {
    adjust: { brightness: 0.82, contrast: 1.2, saturate: 0.9, hue: -12 },
    tint: { color: "#0c1a4b", alpha: 0.4, mode: "multiply" },
    vignette: 0.4,
    effects: [fx("stars", { count: 130 }), fx("shooting", { count: 2 })],
  }),

  // ───────────────────────── Nature ─────────────────────────
  preset("nature", "foret", "🌲", "Forêt enchantée", ["#1f7a3a", "#d9ff6a"], {
    adjust: { saturate: 1.3, brightness: 0.95, hue: 6 },
    tint: { color: "#1f7a3a", alpha: 0.25, mode: "soft-light" },
    vignette: 0.45,
    effects: [fx("rays", { count: 5, color: "#e8ffd0", alpha: 0.3 }), fx("fireflies", { count: 30 }), fx("dust", { count: 40, color: "#e8ffd0" })],
  }),
  preset("nature", "jungle", "🦜", "Jungle", ["#0b7a2a", "#8bd05a"], {
    adjust: { saturate: 1.5, contrast: 1.12, brightness: 0.95 },
    tint: { color: "#0b7a2a", alpha: 0.3, mode: "overlay" },
    vignette: 0.4,
    effects: [fx("fog", { count: 5, color: "#c8ffd0", alpha: 0.1 }), fx("leaves", { count: 16, color: "#2fa84f", color2: "#8bd05a" }), fx("rays", { count: 4, color: "#f0ffd0", alpha: 0.25 })],
  }),
  preset("nature", "sahel", "🌾", "Sahel doré", ["#ffd98a", "#d97a1f"], {
    adjust: { sepia: 0.3, saturate: 1.35, brightness: 1.06, contrast: 1.08 },
    tint: { color: "#e0a030", alpha: 0.28, mode: "soft-light" },
    gradient: { top: "#ffe2a0", bottom: "#d97a1f", alpha: 0.22, mode: "soft-light" },
    effects: [fx("dust", { count: 90, color: "#ffd98a", alpha: 0.55 }), fx("bokeh", { count: 6, color: "#ffcf70", alpha: 0.18 })],
  }),
  preset("nature", "desert", "🏜️", "Désert", ["#f1d29c", "#b5762c"], {
    adjust: { sepia: 0.45, brightness: 1.08, contrast: 1.12, saturate: 1.2 },
    tint: { color: "#e0b070", alpha: 0.3, mode: "soft-light" },
    effects: [fx("dust", { count: 140, color: "#f1d29c", alpha: 0.6, speed: 2 }), fx("fog", { count: 4, color: "#e8c38f", alpha: 0.14 })],
  }),
  preset("nature", "sakura", "🌸", "Cerisiers", ["#ffb7d5", "#ff7eb6"], {
    adjust: { brightness: 1.07, saturate: 1.2, contrast: 0.98 },
    tint: { color: "#ff9ecb", alpha: 0.2, mode: "soft-light" },
    effects: [fx("petals", { count: 34 }), fx("bokeh", { count: 8, color: "#ffc4de", alpha: 0.22 })],
  }),
  preset("nature", "automne", "🍂", "Automne", ["#d2691e", "#7a3b0c"], {
    adjust: { sepia: 0.2, saturate: 1.4, contrast: 1.08, hue: -8 },
    tint: { color: "#d2691e", alpha: 0.25, mode: "soft-light" },
    vignette: 0.35,
    effects: [fx("leaves", { count: 26 }), fx("dust", { count: 30, color: "#ffcf9a" })],
  }),
  preset("nature", "pluie", "🌧️", "Pluie douce", ["#3a5a7a", "#cfe0f0"], {
    adjust: { brightness: 0.92, saturate: 0.8, contrast: 1.1 },
    tint: { color: "#3a5a7a", alpha: 0.3, mode: "multiply" },
    effects: [fx("rain", { count: 120 }), fx("fog", { count: 4, alpha: 0.1, color: "#cfe0f0" })],
  }),
  preset("nature", "brume", "☁️", "Brume matinale", ["#e6eef5", "#9fb8c8"], {
    adjust: { brightness: 1.05, contrast: 0.92, saturate: 0.85, blur: 0.5 },
    tint: { color: "#e6eef5", alpha: 0.18, mode: "screen" },
    effects: [fx("fog", { count: 9, alpha: 0.2 }), fx("rays", { count: 4, alpha: 0.25, color: "#fffbe6" })],
  }),

  // ───────────────────────── Néon ─────────────────────────
  preset("neon", "cyberpunk", "🤖", "Cyberpunk", ["#00e5ff", "#ff2bd6"], {
    adjust: { contrast: 1.25, saturate: 1.6, brightness: 0.95, hue: 6 },
    tint: { color: "#ff2bd6", alpha: 0.22, mode: "soft-light" },
    gradient: { top: "#00e5ff", bottom: "#ff2bd6", alpha: 0.3, mode: "overlay" },
    vignette: 0.4,
    effects: [fx("scanlines", { alpha: 0.16 }), fx("glitch"), fx("rain", { count: 60, color: "#8be9ff", alpha: 0.3 })],
  }),
  preset("neon", "synthwave", "🌆", "Synthwave", ["#ff2bd6", "#2a0a5e"], {
    adjust: { contrast: 1.2, saturate: 1.6, brightness: 0.95 },
    gradient: { top: "#2a0a5e", bottom: "#ff2bd6", alpha: 0.4, mode: "overlay" },
    vignette: 0.4,
    effects: [fx("synthgrid"), fx("stars", { count: 70 })],
  }),
  preset("neon", "matrix", "🟩", "Matrix", ["#22ff88", "#001a0a"], {
    adjust: { contrast: 1.3, saturate: 0.7, brightness: 0.85, hue: 80 },
    tint: { color: "#00ff6a", alpha: 0.3, mode: "overlay" },
    vignette: 0.5,
    effects: [fx("code", { count: 28 }), fx("scanlines", { alpha: 0.12 })],
  }),
  preset("neon", "neon-violet", "💜", "Néon violet", ["#c77dff", "#3b0764"], {
    adjust: { contrast: 1.2, saturate: 1.5, brightness: 0.92, hue: 20 },
    tint: { color: "#8a2be2", alpha: 0.3, mode: "overlay" },
    vignette: 0.5,
    effects: [fx("bokeh", { count: 12, color: "#c77dff", alpha: 0.3 }), fx("sparkles", { count: 24, color: "#e9c8ff" })],
  }),
  preset("neon", "hologramme", "🔷", "Hologramme", ["#00f0ff", "#7a5cff"], {
    adjust: { saturate: 1.4, contrast: 1.15, brightness: 1.05, hue: -30 },
    tint: { color: "#00f0ff", alpha: 0.25, mode: "soft-light" },
    effects: [fx("scanlines", { color: "#00302f", alpha: 0.2 }), fx("glitch", { color: "#00fff0", color2: "#7a5cff" }), fx("sparkles", { color: "#aaffff", count: 18 })],
  }),
  preset("neon", "glitch", "📺", "Glitch", ["#ff0055", "#00fff0"], {
    adjust: { contrast: 1.25, saturate: 1.3 },
    tint: { color: "#ff0055", alpha: 0.08, mode: "overlay" },
    effects: [fx("glitch", { count: 6, alpha: 0.9 }), fx("scanlines", { alpha: 0.1 })],
  }),
  preset("neon", "electrique", "⚡", "Électrique", ["#3a7bff", "#e0f0ff"], {
    adjust: { contrast: 1.3, saturate: 1.4, brightness: 1.05, hue: -10 },
    tint: { color: "#3a7bff", alpha: 0.25, mode: "overlay" },
    vignette: 0.4,
    effects: [fx("lightning", { color: "#e0f0ff", alpha: 0.9 }), fx("sparkles", { count: 30, color: "#9fd0ff" }), fx("fireflies", { count: 14, color: "#8ec5ff" })],
  }),

  // ───────────────────────── Rétro ─────────────────────────
  preset("retro", "vintage70", "📻", "Vintage 70s", ["#ff9f40", "#6b3a10"], {
    adjust: { sepia: 0.35, saturate: 1.25, contrast: 1.05, brightness: 1.02, hue: -8 },
    tint: { color: "#ff9f40", alpha: 0.2, mode: "soft-light" },
    vignette: 0.5,
    grain: 0.35,
    effects: [fx("dust", { count: 30, color: "#fff0d0", alpha: 0.4 })],
  }),
  preset("retro", "noir-blanc", "🎬", "Noir & blanc", ["#f5f5f5", "#111111"], {
    adjust: { grayscale: 1, contrast: 1.25 },
    vignette: 0.5,
    grain: 0.35,
    effects: [],
  }),
  preset("retro", "polaroid", "📷", "Polaroid", ["#ffe7c2", "#c79a6b"], {
    adjust: { saturate: 0.9, contrast: 1.05, brightness: 1.08, sepia: 0.15, hue: -5 },
    tint: { color: "#ffe7c2", alpha: 0.2, mode: "soft-light" },
    vignette: 0.35,
    grain: 0.15,
    effects: [],
  }),
  preset("retro", "cine", "🎥", "Ciné", ["#0e7c86", "#ff8a3c"], {
    adjust: { contrast: 1.18, saturate: 1.2, brightness: 0.96 },
    gradient: { top: "#0e7c86", bottom: "#ff8a3c", alpha: 0.32, mode: "soft-light" },
    vignette: 0.5,
    grain: 0.12,
    effects: [],
  }),
  preset("retro", "vhs", "📼", "VHS 90s", ["#6a5acd", "#ff6ec7"], {
    adjust: { contrast: 1.1, saturate: 1.4, brightness: 1.05, hue: -4, blur: 0.4 },
    tint: { color: "#6a5acd", alpha: 0.12, mode: "overlay" },
    grain: 0.3,
    effects: [fx("scanlines", { alpha: 0.14 }), fx("glitch", { count: 2, alpha: 0.7 })],
  }),
  preset("retro", "super8", "🎞️", "Super 8", ["#d98c3a", "#3a1f08"], {
    adjust: { sepia: 0.3, saturate: 1.3, contrast: 1.12, brightness: 1.02 },
    tint: { color: "#d98c3a", alpha: 0.2, mode: "soft-light" },
    vignette: 0.55,
    grain: 0.45,
    effects: [fx("dust", { count: 50, color: "#fff6e0", alpha: 0.5 })],
  }),
  preset("retro", "sepia", "🟤", "Sépia ancien", ["#c9a06a", "#3a2410"], {
    adjust: { sepia: 0.9, contrast: 1.1, brightness: 0.98 },
    vignette: 0.6,
    grain: 0.3,
    effects: [],
  }),

  // ───────────────────────── Rêve & Fête ─────────────────────────
  preset("dream", "reve-rose", "💗", "Rêve rose", ["#ff8fc2", "#ffd1e6"], {
    adjust: { brightness: 1.08, saturate: 1.2, contrast: 0.95, blur: 0.4 },
    tint: { color: "#ff8fc2", alpha: 0.25, mode: "soft-light" },
    effects: [fx("hearts", { count: 16 }), fx("bokeh", { count: 10, color: "#ffc2dd", alpha: 0.25 }), fx("sparkles", { count: 24, color: "#fff0f7" })],
  }),
  preset("dream", "paillettes", "✨", "Paillettes", ["#ffd700", "#ff9a3c"], {
    adjust: { brightness: 1.05, saturate: 1.25, contrast: 1.05 },
    tint: { color: "#ffd700", alpha: 0.15, mode: "soft-light" },
    effects: [fx("sparkles", { count: 70, size: [0.006, 0.022] }), fx("bokeh", { count: 8, color: "#ffe08a", alpha: 0.2 })],
  }),
  preset("dream", "bokeh-or", "🌟", "Bokeh doré", ["#ffb347", "#6b3a10"], {
    adjust: { brightness: 1.05, saturate: 1.2 },
    tint: { color: "#ffb347", alpha: 0.2, mode: "soft-light" },
    effects: [fx("bokeh", { count: 20, alpha: 0.32 }), fx("dust", { count: 40 })],
  }),
  preset("dream", "fete", "🎉", "Fête", ["#ff4df0", "#ffd24d"], {
    adjust: { saturate: 1.4, brightness: 1.05, contrast: 1.05 },
    effects: [fx("confetti", { count: 70 }), fx("sparkles", { count: 24 }), fx("bokeh", { count: 8, color: "#ff7ad9", alpha: 0.2 })],
  }),
  preset("dream", "licorne", "🦄", "Licorne", ["#ff9ad5", "#8fd3ff"], {
    adjust: { saturate: 1.35, brightness: 1.08, contrast: 0.97 },
    gradient: { stops: ["#ff9ad5", "#c9a0ff", "#8fd3ff", "#a0ffd6"], alpha: 0.32, mode: "soft-light" },
    effects: [fx("sparkles", { count: 40, color: "#ffffff" }), fx("bokeh", { count: 10, color: "#ffd1f0", alpha: 0.22 })],
  }),
  preset("dream", "amour", "❤️", "Amour", ["#ff2d55", "#6b0f2a"], {
    adjust: { saturate: 1.3, brightness: 1.04, contrast: 1.05 },
    tint: { color: "#ff2d55", alpha: 0.2, mode: "soft-light" },
    vignette: 0.4,
    effects: [fx("hearts", { count: 22, color: "#ff4d73" }), fx("bokeh", { count: 8, color: "#ff7a9c", alpha: 0.22 })],
  }),
  preset("dream", "cristal", "💎", "Cristal", ["#a5f3fc", "#fbcfe8"], {
    adjust: { saturate: 1.2, brightness: 1.1, contrast: 1.12 },
    gradient: { stops: ["#a5f3fc", "#e0e7ff", "#fbcfe8"], alpha: 0.3, mode: "soft-light" },
    effects: [fx("sparkles", { count: 60, color: "#ffffff", alpha: 1 }), fx("rays", { count: 5, alpha: 0.28, color: "#ffffff" })],
  }),
  preset("dream", "disco", "🪩", "Disco", ["#ff4df0", "#4de1ff"], {
    adjust: { saturate: 1.5, contrast: 1.15, brightness: 0.95 },
    vignette: 0.45,
    effects: [fx("bokeh", { count: 18, color: "#ff4df0", color2: "#4de1ff", alpha: 0.35, speed: 2 }), fx("sparkles", { count: 40, color: "#ffffff" })],
  }),

  // ───────────────────────── Hiver ─────────────────────────
  preset("winter", "blizzard", "🌨️", "Blizzard", ["#cfe6ff", "#6b8cae"], {
    adjust: { brightness: 1.05, saturate: 0.75, contrast: 1.05 },
    tint: { color: "#cfe6ff", alpha: 0.25, mode: "soft-light" },
    effects: [fx("snow", { count: 160, speed: 2.2 }), fx("fog", { count: 5, color: "#ffffff", alpha: 0.14 })],
  }),
  preset("winter", "neige", "❄️", "Neige douce", ["#dcecff", "#9fc3ea"], {
    adjust: { brightness: 1.06, saturate: 0.9 },
    tint: { color: "#dcecff", alpha: 0.2, mode: "soft-light" },
    effects: [fx("snow", { count: 90 }), fx("sparkles", { count: 14, color: "#ffffff" })],
  }),
  preset("winter", "glace", "🧊", "Glace", ["#e6f9ff", "#6fb7ff"], {
    adjust: { brightness: 1.08, contrast: 1.12, saturate: 0.9, hue: -12 },
    tint: { color: "#6fd3ff", alpha: 0.3, mode: "soft-light" },
    gradient: { top: "#e6f9ff", bottom: "#6fb7ff", alpha: 0.25, mode: "soft-light" },
    vignette: 0.3,
    effects: [fx("sparkles", { count: 40, color: "#e8fbff" }), fx("rays", { count: 4, alpha: 0.22, color: "#e8fbff" })],
  }),
  preset("winter", "noel", "🎄", "Noël", ["#e02424", "#2ecc71"], {
    adjust: { saturate: 1.3, brightness: 1.02 },
    tint: { color: "#e02424", alpha: 0.12, mode: "overlay" },
    vignette: 0.35,
    effects: [fx("snow", { count: 70 }), fx("bokeh", { count: 14, color: "#ffd23f", color2: "#2ecc71", alpha: 0.3 }), fx("sparkles")],
  }),
  preset("winter", "nuit-polaire", "🐧", "Nuit polaire", ["#0a2a5a", "#4ade80"], {
    adjust: { brightness: 0.88, contrast: 1.15, saturate: 1.1, hue: -14 },
    tint: { color: "#0a2a5a", alpha: 0.35, mode: "multiply" },
    effects: [fx("aurora", { count: 3 }), fx("snow", { count: 50 }), fx("stars", { count: 70 })],
  }),
  preset("winter", "givre", "🥶", "Givre", ["#b9e4ff", "#3a6a8a"], {
    adjust: { saturate: 0.6, brightness: 1.05, contrast: 1.1, hue: -18 },
    tint: { color: "#b9e4ff", alpha: 0.3, mode: "overlay" },
    vignette: 0.5,
    effects: [fx("fog", { count: 6, alpha: 0.16 }), fx("snow", { count: 40 })],
  }),
];

const BY_ID = new Map(FILTER_PRESETS.map((p) => [p.id, p]));

export const getPreset = (id) => BY_ID.get(id) || null;

export const presetsByCategory = (cat) =>
  FILTER_PRESETS.filter((p) => p.cat === cat);
