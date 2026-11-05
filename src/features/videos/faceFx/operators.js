import { MAX_OPS } from "./warpRenderer.js";
import { MASK_NONE, resolveMask } from "./masks.js";
import {
  BODY_IDS,
  FX_NONE,
  FX_RANDOM,
  generateParams,
  getFaceFxPreset,
} from "./presets.js";

// ───────────── État → réglages ─────────────
export const DEFAULT_MASK = Object.freeze({ id: MASK_NONE, seed: 0, hue: 0 });
export const DEFAULT_FX_STATE = Object.freeze({ id: FX_NONE, seed: 0, intensity: 1, adjust: {}, mask: DEFAULT_MASK });
const MAX_SEED = 2147483646;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function normalizeFxState(raw = {}) {
  const adjust = {};
  if (raw.adjust && typeof raw.adjust === "object") {
    Object.entries(raw.adjust).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n)) adjust[k] = clamp(n, -1.5, 1.5);
    });
  }
  const intensity = Number(raw.intensity);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : FX_NONE,
    seed: Math.floor(clamp(Number(raw.seed) || 0, 0, MAX_SEED)),
    intensity: Number.isFinite(intensity) ? clamp(intensity, 0, 1.5) : 1,
    adjust,
    mask: {
      id: typeof raw.mask?.id === "string" && raw.mask.id ? raw.mask.id : MASK_NONE,
      seed: Math.floor(clamp(Number(raw.mask?.seed) || 0, 0, MAX_SEED)),
      hue: clamp(Number(raw.mask?.hue) || 0, -180, 180),
    },
  };
}

// { params, age, smooth, needsPose, active } : tout ce dont le rendu a besoin.
export function resolveFaceFx(rawState) {
  const state = normalizeFxState(rawState);
  let base = {};
  if (state.id === FX_RANDOM) base = generateParams(state.seed || 1);
  else if (state.id !== FX_NONE) base = getFaceFxPreset(state.id)?.p || {};

  const merged = { ...base };
  Object.entries(state.adjust).forEach(([k, v]) => {
    merged[k] = (merged[k] || 0) + v;
  });
  const params = {};
  let age = 0;
  let smooth = 0;
  let needsPose = false;
  let active = false;
  Object.entries(merged).forEach(([k, raw]) => {
    const v = clamp(raw * state.intensity, k === "smooth" ? 0 : -1.5, 1.5);
    if (Math.abs(v) < 0.02) return;
    active = true;
    if (k === "age") age = clamp(v, -1, 1);
    else if (k === "smooth") smooth = clamp(v, 0, 1);
    else {
      params[k] = v;
      if (BODY_IDS.has(k)) needsPose = true;
    }
  });
  const mask = resolveMask(state.mask) ? state.mask : null;
  const hasWarp = active;
  return { params, age, smooth, needsPose, hasWarp, mask, active: active || !!mask };
}

// ───────────── Réglages → opérateurs ─────────────
const BULGE = 0;
const SHIFT = 1;
const ANISO = 2;

class Ops {
  constructor() {
    this.list = [];
  }
  push(o) {
    if (this.list.length < MAX_OPS) this.list.push(o);
  }
  bulge(pt, r, s) {
    if (Math.abs(s) < 0.005) return;
    this.push({ x: pt.x, y: pt.y, r, type: BULGE, a: clamp(s, -0.85, 0.85) });
  }
  shift(pt, r, vx, vy) {
    this.push({ x: pt.x, y: pt.y, r, type: SHIFT, a: vx, b: vy });
  }
  aniso(pt, r, sx, sy) {
    this.push({ x: pt.x, y: pt.y, r, type: ANISO, a: clamp(sx, -0.85, 0.85), b: clamp(sy, -0.85, 0.85) });
  }
}

// vecteur = a * droite + b * haut (axes propres au visage, qui suit l'inclinaison de la tête)
const along = (g, a, b) => ({
  x: g.right.x * a + g.up.x * b,
  y: g.right.y * a + g.up.y * b,
});

// +1 si le point est du côté « droite » du centre, -1 sinon.
const side = (g, pt) =>
  Math.sign((pt.x - g.center.x) * g.right.x + (pt.y - g.center.y) * g.right.y) || 1;

function faceOps(ops, g, P, age) {
  const W = g.W;
  // Le contexte « vieux / jeune » influence aussi la forme.
  const old = Math.max(age, 0);
  const young = Math.max(-age, 0);
  const eyes = (P.eyes || 0) - old * 0.12 + young * 0.22;
  g.eyes.forEach((e) => ops.bulge(e, W * 0.24, eyes * 0.6));

  if (P.eyeDist) {
    g.eyes.forEach((e) => {
      const v = along(g, side(g, e) * W * 0.09 * P.eyeDist, 0);
      ops.shift(e, W * 0.3, v.x, v.y);
    });
  }
  ops.bulge(g.noseTip, W * 0.22, (P.nose || 0) * 0.65);
  if (P.noseWidth) {
    g.nostrils.forEach((n) => {
      const v = along(g, side(g, n) * W * 0.07 * P.noseWidth, 0);
      ops.shift(n, W * 0.16, v.x, v.y);
    });
  }
  ops.bulge(g.mouthC, W * 0.26, (P.mouth || 0) * 0.55);
  if (P.mouthWidth) {
    g.mouthCorners.forEach((m) => {
      const v = along(g, side(g, m) * W * 0.09 * P.mouthWidth, 0);
      ops.shift(m, W * 0.18, v.x, v.y);
    });
  }
  const smile = (P.smile || 0) - old * 0.3;
  if (Math.abs(smile) > 0.01) {
    g.mouthCorners.forEach((m) => {
      const v = along(g, 0, W * 0.07 * smile);
      ops.shift(m, W * 0.2, v.x, v.y);
    });
  }
  g.cheeks.forEach((c) => ops.bulge(c, W * 0.3, ((P.cheeks || 0) - old * 0.2) * 0.55));
  if (P.jaw || old) {
    g.jaw.forEach((j) => {
      const out = side(g, j) * W * 0.08 * (P.jaw || 0);
      const sag = -W * 0.05 * old;
      const v = along(g, out, sag);
      ops.shift(j, W * 0.3, v.x, v.y);
    });
  }
  const chin = (P.chin || 0) - young * 0.3;
  if (Math.abs(chin) > 0.01) {
    const v = along(g, 0, -W * 0.16 * chin);
    ops.shift(g.chin, W * 0.32, v.x, v.y);
  }
  ops.bulge(g.forehead, W * 0.34, (P.forehead || 0) * 0.55);
  if (P.faceWidth) {
    [g.sideA, g.sideB].forEach((s) => {
      const v = along(g, side(g, s) * W * 0.1 * P.faceWidth, 0);
      ops.shift(s, W * 0.55, v.x, v.y);
    });
  }
  if (P.faceLength) {
    const v = along(g, 0, -W * 0.22 * P.faceLength);
    ops.shift(g.chin, W * 0.7, v.x, v.y);
  }
}

function bodyOps(ops, b, P) {
  const sw = b.shoulderW;
  const L = b.torsoLen;
  const center = (a, c) => ({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
  // Déplace les deux côtés vers l'extérieur (outward > 0 : plus large) ou l'intérieur.
  const squeeze = (pair, mid, r, outward) => {
    pair.forEach((pt) => {
      const dir = Math.sign(pt.x - mid.x) || 1;
      ops.shift(pt, r, dir * outward, 0);
    });
  };
  if (P.head) ops.bulge(b.head, b.head.r * 2.2, P.head * 0.6);
  if (P.shoulders) squeeze(b.shoulders, b.shMid, sw * 0.7, sw * 0.14 * P.shoulders);
  if (P.arms) b.elbows.forEach((e) => e && ops.bulge(e, sw * 0.55, P.arms * 0.55));
  if (P.waist) squeeze(b.waist, b.belly, L * 0.45, sw * 0.17 * P.waist);
  if (P.belly) ops.bulge(b.belly, L * 0.55, P.belly * 0.6);
  if (P.hips) squeeze(b.hips, b.hipMid, L * 0.35, sw * 0.15 * P.hips);
  if (P.legs && b.knees) {
    // Étire verticalement autour des genoux : jambes plus longues (> 0) ou courtes.
    const k = center(b.knees[0], b.knees[1]);
    ops.aniso(k, L * 1.4, 0, 0.35 * P.legs);
  }
}

// Construit la scène du shader. face/body = résultats de analyzeFace / analyzeBody.
export function buildScene(resolved, face, body) {
  const ops = new Ops();
  if (face) faceOps(ops, face, resolved.params, resolved.age);
  if (body) bodyOps(ops, body, resolved.params);
  return {
    ops: ops.list,
    face: face ? face.shader : null,
    age: resolved.age,
    smooth: resolved.smooth,
  };
}
