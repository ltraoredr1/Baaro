import { EFFECTS, FX_DEFAULTS, FX_NEEDS_BACKDROP, FX_TYPES } from "./effects.js";
import { getPreset } from "./presets.js";
import {
  clamp,
  hash01,
  hslToRgb,
  makeRng,
  rgbToHex,
  rgbToHsl,
  rgba,
  rotateHue,
  toRgb,
} from "./utils.js";

// ───────────────────────────────────────────────────────────────────────────
// Moteur de filtres BAARO — 100 % navigateur, sans dépendance.
//
// État d'un filtre (petit, sérialisable)   →  resolveFilter()  →  « spec »
// { id, seed, intensity, hue, density,         (réglages d'image, voile,
//   brightness, contrast, saturation }          dégradé, effets prêts à dessiner)
//
// Une même recette donne une infinité de rendus : la graine (seed) change la
// position des particules et décale légèrement la palette, la teinte/densité/
// intensité sont réglables, et l'id « random » génère une recette complète à
// partir d'un simple nombre (des milliards de filtres uniques).
// ───────────────────────────────────────────────────────────────────────────

export const FILTER_NONE = "none";
export const FILTER_RANDOM = "random";

export const DEFAULT_FILTER_STATE = Object.freeze({
  id: FILTER_NONE,
  seed: 0,
  intensity: 1,
  hue: 0,
  density: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
});

const MAX_SEED = 2147483646;

export const randomSeed = () => 1 + Math.floor(Math.random() * MAX_SEED);

export function normalizeFilterState(raw = {}) {
  const num = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, min, max) : fallback;
  };
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : FILTER_NONE,
    seed: Math.floor(num(raw.seed, 0, MAX_SEED, 0)),
    intensity: num(raw.intensity, 0, 1.5, 1),
    hue: num(raw.hue, -180, 180, 0),
    density: num(raw.density, 0, 2.5, 1),
    brightness: num(raw.brightness, -0.5, 0.5, 0),
    contrast: num(raw.contrast, -0.5, 0.5, 0),
    saturation: num(raw.saturation, -0.5, 0.5, 0),
  };
}

// Appareils modestes : moins de particules pour garder une caméra fluide.
export function detectQuality() {
  if (typeof navigator === "undefined") return 1;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (cores <= 4 || memory <= 2) return 0.55;
  if (cores <= 6) return 0.8;
  return 1;
}

// ───────────────────────────── Générateur infini ─────────────────────────────

const NOUNS = [
  ["Aube", 1], ["Brume", 1], ["Lagune", 1], ["Cosmos", 0], ["Éclat", 0], ["Mirage", 0],
  ["Aurore", 1], ["Nébuleuse", 1], ["Abysse", 0], ["Oasis", 1], ["Spectre", 0], ["Horizon", 0],
  ["Cascade", 1], ["Éclipse", 1], ["Vertige", 0], ["Orage", 0], ["Zénith", 0], ["Rêverie", 1],
  ["Onde", 1], ["Braise", 1], ["Cristal", 0], ["Crépuscule", 0], ["Sillage", 0], ["Halo", 0],
];

const ADJECTIVES = [
  ["céleste", "céleste"], ["abyssal", "abyssale"], ["doré", "dorée"], ["spectral", "spectrale"],
  ["irisé", "irisée"], ["glacé", "glacée"], ["mystique", "mystique"], ["incandescent", "incandescente"],
  ["onirique", "onirique"], ["sauvage", "sauvage"], ["cosmique", "cosmique"], ["lunaire", "lunaire"],
  ["écarlate", "écarlate"], ["émeraude", "émeraude"], ["velouté", "veloutée"], ["électrique", "électrique"],
  ["brumeux", "brumeuse"], ["solaire", "solaire"], ["sacré", "sacrée"], ["étrange", "étrange"],
  ["nocturne", "nocturne"], ["vibrant", "vibrante"], ["limpide", "limpide"], ["infini", "infinie"],
];

// Effets dont la couleur peut suivre la palette générée.
const PALETTE_FX = new Set([
  "bubbles", "rays", "ripples", "stars", "shooting", "nebula", "spirits", "halo", "portal",
  "fireflies", "snow", "embers", "flames", "sparkles", "petals", "leaves", "dust", "aurora",
  "hearts", "confetti", "bokeh", "synthgrid", "lightning", "glitch", "code",
]);

const TINT_MODES = ["soft-light", "overlay", "soft-light", "screen", "multiply"];
const GRADIENT_MODES = ["soft-light", "overlay", "screen", "soft-light"];

const seedToRng = (seed) => makeRng((Math.imul(seed | 0, 2654435761) + 1) >>> 0);

export function generateRecipe(seed) {
  const rng = seedToRng(seed);
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const hue = rng() * 360;
  const sat = 0.65 + rng() * 0.3;
  const c1 = hslToRgb(hue, sat, 0.45 + rng() * 0.15);
  const c2 = hslToRgb(hue + 40 + rng() * 140, 0.65 + rng() * 0.3, 0.4 + rng() * 0.2);
  const light1 = hslToRgb(hue, 0.9, 0.78);
  const light2 = hslToRgb(rgbToHsl(c2)[0], 0.9, 0.78);

  const tintMode = pick(TINT_MODES);
  const tintColor = tintMode === "multiply" ? hslToRgb(hue, sat, 0.22) : c1;

  const effects = [];
  const wanted = 1 + Math.floor(rng() * 3);
  let guard = 0;
  while (effects.length < wanted && guard < 20) {
    guard += 1;
    const type = pick(FX_TYPES);
    if (effects.some((e) => e.type === type)) continue;
    const base = FX_DEFAULTS[type];
    const over = { type, count: Math.max(1, Math.round(base.count * (0.6 + rng() * 0.9))) };
    if (PALETTE_FX.has(type)) {
      over.color = rgbToHex(rng() < 0.5 ? light1 : light2);
      over.color2 = rgbToHex(rng() < 0.5 ? light2 : light1);
    }
    effects.push(over);
  }

  const noun = pick(NOUNS);
  const adjective = pick(ADJECTIVES);

  return {
    id: FILTER_RANDOM,
    cat: "infinite",
    emoji: "∞",
    label: `${noun[0]} ${adjective[noun[1]]}`,
    sw: [rgbToHex(c1), rgbToHex(c2)],
    adjust: {
      brightness: 0.82 + rng() * 0.34,
      contrast: 1 + rng() * 0.3,
      saturate: 0.9 + rng() * 0.8,
      hue: (rng() - 0.5) * 50,
      sepia: rng() < 0.2 ? rng() * 0.5 : 0,
      blur: rng() < 0.15 ? 0.5 : 0,
    },
    tint: { color: tintColor, alpha: tintMode === "multiply" ? 0.25 + rng() * 0.2 : 0.12 + rng() * 0.28, mode: tintMode },
    gradient: rng() < 0.7 ? { top: c1, bottom: c2, alpha: 0.15 + rng() * 0.25, mode: pick(GRADIENT_MODES) } : null,
    vignette: rng() * 0.65,
    grain: rng() < 0.35 ? rng() * 0.35 : 0,
    effects,
  };
}

// Nom + pastilles pour l'interface, sans résoudre tout le filtre.
export function describeFilter(rawState) {
  const state = normalizeFilterState(rawState);
  if (state.id === FILTER_NONE) return { label: "Aucun filtre", emoji: "🚫", sw: ["#3f3f46", "#18181b"] };
  const recipe = state.id === FILTER_RANDOM ? generateRecipe(state.seed) : getPreset(state.id);
  if (!recipe) return { label: "Aucun filtre", emoji: "🚫", sw: ["#3f3f46", "#18181b"] };
  return { label: recipe.label, emoji: recipe.emoji, sw: recipe.sw };
}

// ───────────────────────────── Résolution ─────────────────────────────

const NEUTRAL = { brightness: 1, contrast: 1, saturate: 1, hue: 0, sepia: 0, grayscale: 0, blur: 0 };
const LIMITS = {
  brightness: [0.3, 2],
  contrast: [0.3, 2.2],
  saturate: [0, 3],
  hue: [-360, 360],
  sepia: [0, 1],
  grayscale: [0, 1],
  blur: [0, 6],
};

// Effets « uniques » : le nombre d'éléments n'a pas de sens à multiplier.
const SINGLE_FX = new Set(["planet", "halo", "lightning", "scanlines"]);

export function resolveFilter(rawState, { quality = 1 } = {}) {
  const state = normalizeFilterState(rawState);
  if (state.id === FILTER_NONE) return null;

  const recipe = state.id === FILTER_RANDOM ? generateRecipe(state.seed) : getPreset(state.id);
  if (!recipe) return null;

  // Variantes : la graine d'un filtre prédéfini change sa palette et la dispersion des particules.
  let jitterHue = 0;
  let jitterDensity = 1;
  if (state.id !== FILTER_RANDOM && state.seed > 0) {
    const rng = seedToRng(state.seed);
    jitterHue = (rng() * 2 - 1) * 40;
    jitterDensity = 0.8 + rng() * 0.5;
  }
  const shift = state.hue + jitterHue;
  const intensity = state.intensity;
  const level = clamp(intensity, 0, 1);
  const recolor = (color) => rotateHue(toRgb(color), shift);

  const adjust = {};
  for (const key of Object.keys(NEUTRAL)) {
    const target = recipe.adjust?.[key] ?? NEUTRAL[key];
    adjust[key] = NEUTRAL[key] + (target - NEUTRAL[key]) * intensity;
  }
  adjust.brightness += state.brightness;
  adjust.contrast += state.contrast;
  adjust.saturate += state.saturation;
  adjust.hue += shift;
  for (const key of Object.keys(LIMITS)) adjust[key] = clamp(adjust[key], ...LIMITS[key]);

  const tint = recipe.tint
    ? { rgb: recolor(recipe.tint.color), alpha: clamp(recipe.tint.alpha * intensity, 0, 1), mode: recipe.tint.mode }
    : null;

  let gradient = null;
  if (recipe.gradient) {
    const colors = recipe.gradient.stops || [recipe.gradient.top, recipe.gradient.bottom];
    gradient = {
      stops: colors.map(recolor),
      alpha: clamp(recipe.gradient.alpha * intensity, 0, 1),
      mode: recipe.gradient.mode,
    };
  }

  const countScale = state.density * jitterDensity * quality * (0.3 + 0.7 * level);
  const alphaScale = clamp(intensity, 0, 1.2);
  const effects = [];
  (recipe.effects || []).forEach((fx, index) => {
    const base = FX_DEFAULTS[fx.type];
    if (!base || !EFFECTS[fx.type]) return;
    const merged = { ...base, ...fx };
    const count = SINGLE_FX.has(fx.type)
      ? state.density > 0.05 && level > 0.05 ? merged.count : 0
      : Math.round(merged.count * countScale);
    if (count <= 0) return;
    effects.push({
      ...merged,
      count,
      alpha: clamp(merged.alpha * alphaScale, 0, 1),
      c: recolor(merged.color),
      c2: recolor(merged.color2 ?? merged.color),
      seed: (Math.imul(state.seed + 1, 2654435761) + Math.imul(index + 1, 40503) + 17) >>> 0,
    });
  });

  return {
    id: state.id,
    label: recipe.label,
    adjust,
    tint,
    gradient,
    vignette: clamp((recipe.vignette || 0) * intensity, 0, 0.95),
    grain: clamp((recipe.grain || 0) * intensity, 0, 1),
    effects,
    needsBackdrop: effects.some((e) => FX_NEEDS_BACKDROP.has(e.type)),
  };
}

// Équivalent CSS des réglages d'image (aperçu <video> et ctx.filter).
// scale : taille de rendu / 720 px, pour que le flou garde la même finesse.
export function cssFilterString(spec, scale = 1) {
  if (!spec) return "none";
  const a = spec.adjust;
  const parts = [];
  const push = (name, value, neutral, unit = "") => {
    if (Math.abs(value - neutral) > 0.004) parts.push(`${name}(${+value.toFixed(3)}${unit})`);
  };
  push("brightness", a.brightness, 1);
  push("contrast", a.contrast, 1);
  push("saturate", a.saturate, 1);
  push("hue-rotate", a.hue, 0, "deg");
  push("sepia", a.sepia, 0);
  push("grayscale", a.grayscale, 0);
  if (a.blur > 0.05) parts.push(`blur(${+(a.blur * scale).toFixed(2)}px)`);
  return parts.length ? parts.join(" ") : "none";
}

// ───────────────────────────── Rendu canvas ─────────────────────────────

let grainTile = null;
const grainPatterns = new WeakMap();

const getGrain = (ctx) => {
  if (typeof document === "undefined") return null;
  if (!grainTile) {
    grainTile = document.createElement("canvas");
    grainTile.width = 160;
    grainTile.height = 160;
    const g = grainTile.getContext("2d");
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  let pattern = grainPatterns.get(ctx);
  if (!pattern) {
    pattern = ctx.createPattern(grainTile, "repeat");
    grainPatterns.set(ctx, pattern);
  }
  return pattern;
};

// Calques par-dessus l'image : dégradé, voile, effets, vignette, grain.
// blend:false → calque transparent posé sur un <video> (aperçu), sans fusion avec l'image.
export function drawOverlays(ctx, W, H, spec, ms, { blend = true } = {}) {
  if (!spec) return;
  const t = ms / 1000;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const { gradient, tint } = spec;
  if (gradient && gradient.alpha > 0.002) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const n = gradient.stops.length;
    gradient.stops.forEach((rgb, i) => g.addColorStop(n === 1 ? 0 : i / (n - 1), rgba(rgb, 1)));
    ctx.globalCompositeOperation = blend ? gradient.mode : "source-over";
    ctx.globalAlpha = blend ? gradient.alpha : gradient.alpha * 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (tint && tint.alpha > 0.002) {
    ctx.globalCompositeOperation = blend ? tint.mode : "source-over";
    ctx.globalAlpha = blend ? tint.alpha : tint.alpha * 0.45;
    ctx.fillStyle = rgba(tint.rgb, 1);
    ctx.fillRect(0, 0, W, H);
  }

  for (const effect of spec.effects) {
    if (!blend && FX_NEEDS_BACKDROP.has(effect.type)) continue;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = blend ? effect.blend || "screen" : "source-over";
    EFFECTS[effect.type](ctx, W, H, t, effect, effect.seed);
    ctx.restore();
  }

  if (spec.vignette > 0.01) {
    const r = Math.hypot(W, H) / 2;
    const v = ctx.createRadialGradient(W / 2, H / 2, r * 0.3, W / 2, H / 2, r);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${spec.vignette})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  if (spec.grain > 0.01) {
    const pattern = getGrain(ctx);
    if (pattern) {
      const ox = Math.floor(hash01(1, Math.floor(t * 24), 1) * 160);
      const oy = Math.floor(hash01(2, Math.floor(t * 24), 2) * 160);
      ctx.globalCompositeOperation = blend ? "overlay" : "source-over";
      ctx.globalAlpha = blend ? spec.grain * 0.5 : spec.grain * 0.12;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pattern;
      ctx.fillRect(ox, oy, W, H);
    }
  }

  ctx.restore();
}

// Navigateurs sans ctx.filter (Safari) : approximation par fusion de calques.
function approximateAdjust(ctx, W, H, a) {
  ctx.save();
  const desaturate = clamp(1 - a.saturate + a.grayscale, 0, 1);
  if (desaturate > 0.02) {
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = desaturate;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W, H);
  }
  if (a.sepia > 0.02) {
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = a.sepia * 0.7;
    ctx.fillStyle = "#704214";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";
  if (a.brightness < 0.98) {
    ctx.globalAlpha = 1 - a.brightness;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  } else if (a.brightness > 1.02) {
    ctx.globalAlpha = (a.brightness - 1) * 0.5;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
  }
  if (a.contrast > 1.02) {
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = clamp((a.contrast - 1) * 0.8, 0, 1);
    ctx.drawImage(ctx.canvas, 0, 0);
  }
  ctx.restore();
}

// Dessine `source` (vidéo, image ou canvas) en « cover » sur tout le canevas, filtre appliqué.
export function drawFiltered(ctx, source, sw, sh, spec, ms) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const scale = Math.max(W / sw, H / sh);
  const w = sw * scale;
  const h = sh * scale;
  const native = !!spec && "filter" in ctx;

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (native) ctx.filter = cssFilterString(spec, W / 720);
  ctx.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
  if (native) ctx.filter = "none";
  else if (spec) approximateAdjust(ctx, W, H, spec.adjust);

  drawOverlays(ctx, W, H, spec, ms);
}

// Enveloppe un dessinateur de frames (photos / texte) pour y appliquer le filtre.
export function withFilter(drawFrame, spec) {
  if (!spec) return drawFrame;
  let off = null;
  let offCtx = null;
  return (ctx, ms) => {
    const { width: W, height: H } = ctx.canvas;
    if (!off || off.width !== W || off.height !== H) {
      off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      offCtx = off.getContext("2d");
    }
    drawFrame(offCtx, ms);
    drawFiltered(ctx, off, W, H, spec, ms);
  };
}
