import { TAU, frac, hash01, lerp, rgba, rotateHue } from "./utils.js";

// Effets animés dessinés par-dessus l'image (bulles, étoiles, esprits…).
// Chaque effet est une fonction pure de (temps, graine) : pas d'état, donc le
// même rendu en aperçu et à l'enregistrement. Les tailles sont relatives à la
// largeur du canevas pour s'adapter à toutes les résolutions.

export const FX_DEFAULTS = {
  bubbles: { count: 18, size: [0.012, 0.04], speed: 1, alpha: 0.7, color: "#d6f6ff" },
  rays: { count: 5, speed: 1, alpha: 0.35, color: "#e6fbff" },
  waves: { count: 3, speed: 1, alpha: 0.35, color: "#0a8fbf", blend: "source-over" },
  ripples: { count: 7, speed: 1, alpha: 0.25, color: "#bff3ff" },
  fish: { count: 7, size: [0.03, 0.07], speed: 1, alpha: 0.55, color: "#021a2b", blend: "source-over" },
  stars: { count: 90, size: [0.002, 0.0055], speed: 1, alpha: 0.9, color: "#ffffff" },
  shooting: { count: 3, speed: 1, alpha: 0.9, color: "#ffffff" },
  nebula: { count: 5, size: [0.35, 0.8], speed: 1, alpha: 0.35, color: "#a855f7", color2: "#38bdf8" },
  planet: { count: 1, size: [0.3, 0.3], speed: 1, alpha: 0.95, color: "#e9c98a", color2: "#7a5a2a", blend: "source-over" },
  spirits: { count: 14, size: [0.03, 0.09], speed: 1, alpha: 0.55, color: "#bfe9ff" },
  halo: { count: 1, size: [0.7, 0.7], speed: 1, alpha: 0.5, color: "#fff3c4" },
  portal: { count: 7, size: [0.1, 0.55], speed: 1, alpha: 0.7, color: "#c084fc", color2: "#22d3ee" },
  fireflies: { count: 26, size: [0.012, 0.03], speed: 1, alpha: 0.9, color: "#d9ff6a" },
  snow: { count: 90, size: [0.003, 0.01], speed: 1, alpha: 0.85, color: "#ffffff" },
  rain: { count: 110, speed: 1, alpha: 0.4, color: "#cfe4ff" },
  embers: { count: 45, size: [0.003, 0.01], speed: 1, alpha: 0.9, color: "#ff8a1f", color2: "#ffd24a" },
  flames: { count: 12, speed: 1, alpha: 0.6, color: "#ff6a00", color2: "#ffd24a" },
  sparkles: { count: 40, size: [0.008, 0.024], speed: 1, alpha: 0.9, color: "#fff6c8" },
  petals: { count: 28, size: [0.012, 0.026], speed: 1, alpha: 0.85, color: "#ffb7d5" },
  leaves: { count: 22, size: [0.018, 0.04], speed: 1, alpha: 0.9, color: "#d9822b", color2: "#a3a13b" },
  dust: { count: 60, size: [0.002, 0.005], speed: 1, alpha: 0.5, color: "#ffe7b0" },
  lightning: { count: 1, speed: 1, alpha: 0.85, color: "#dfe9ff" },
  aurora: { count: 3, speed: 1, alpha: 0.5, color: "#4ade80", color2: "#a78bfa" },
  fog: { count: 6, size: [0.5, 0.9], speed: 1, alpha: 0.14, color: "#ffffff", blend: "source-over" },
  glitch: { count: 3, speed: 1, alpha: 0.8, color: "#00fff0", color2: "#ff2bd6", blend: "source-over" },
  scanlines: { count: 1, speed: 1, alpha: 0.18, color: "#000000", blend: "source-over" },
  hearts: { count: 16, size: [0.02, 0.05], speed: 1, alpha: 0.8, color: "#ff5c8a" },
  confetti: { count: 50, size: [0.01, 0.022], speed: 1, alpha: 0.95, color: "#ffcc00", color2: "#00c2ff" },
  bokeh: { count: 16, size: [0.05, 0.16], speed: 1, alpha: 0.28, color: "#ffd27a", color2: "#ffd27a" },
  synthgrid: { count: 14, speed: 1, alpha: 0.7, color: "#ff2bd6", color2: "#22d3ee", blend: "source-over" },
  code: { count: 26, size: [0.03, 0.03], speed: 1, alpha: 0.7, color: "#22ff88" },
};

export const FX_TYPES = Object.keys(FX_DEFAULTS);

// Effets qui recopient une partie de l'image : inutilisables sur un calque transparent.
export const FX_NEEDS_BACKDROP = new Set(["glitch"]);

const makeCanvas = (w, h) => {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
};

// Sprite de halo lumineux mis en cache : bien plus rapide qu'un dégradé radial par particule.
const spriteCache = new Map();
const glowSprite = (rgb) => {
  const key = rgb.join(",");
  let sprite = spriteCache.get(key);
  if (!sprite) {
    if (spriteCache.size > 80) spriteCache.clear();
    sprite = makeCanvas(64, 64);
    const g = sprite.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(rgb, 1));
    grad.addColorStop(0.28, rgba(rgb, 0.5));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(key, sprite);
  }
  return sprite;
};

const glow = (ctx, rgb, x, y, r, alpha) => {
  if (alpha <= 0.003 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
};

const sizeOf = (e, s, i, W, k = 11) =>
  lerp(e.size[0], e.size[1], hash01(s, i, k)) * W;

const heartPath = (ctx, x, y, s) => {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.95, y - s * 0.1, x - s * 0.55, y - s * 0.85, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 0.85, x + s * 0.95, y - s * 0.1, x, y + s * 0.35);
  ctx.closePath();
};

// Pétales / feuilles / confettis : chute oscillante avec rotation.
const falling = (shape) => (ctx, W, H, t, e, s) => {
  for (let i = 0; i < e.count; i += 1) {
    const r = sizeOf(e, s, i, W);
    const p = frac(hash01(s, i, 1) + t * (0.04 + 0.05 * hash01(s, i, 2)) * e.speed);
    const x = (hash01(s, i, 3) + 0.08 * Math.sin(t * 0.6 * e.speed + i * 1.7)) * W;
    const y = p * (H + r * 4) - r * 2;
    const rot = t * (0.8 + hash01(s, i, 4)) * e.speed + i;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = e.alpha * Math.min(1, p * 8, (1 - p) * 8);
    if (shape === "confetti") {
      const pal = (e.pal ||= [0, 60, 120, 180, 240, 300].map((deg) =>
        rgba(rotateHue(e.c, deg), 1),
      ));
      ctx.fillStyle = pal[i % pal.length];
      ctx.scale(1, Math.abs(Math.sin(rot * 2)) * 0.8 + 0.2);
      ctx.fillRect(-r, -r * 0.5, r * 2, r);
    } else {
      ctx.fillStyle = rgba(i % 2 ? e.c : e.c2, 1);
      ctx.beginPath();
      if (shape === "leaf") {
        ctx.moveTo(-r, 0);
        ctx.quadraticCurveTo(0, -r * 0.9, r, 0);
        ctx.quadraticCurveTo(0, r * 0.9, -r, 0);
      } else {
        ctx.scale(1, 0.55);
        ctx.ellipse(0, 0, r, r * 0.75, 0, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  }
};

export const EFFECTS = {
  bubbles(ctx, W, H, t, e, s) {
    ctx.strokeStyle = rgba(e.c, 1);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const p = frac(hash01(s, i, 3) + t * e.speed * lerp(0.6, 1.4, hash01(s, i, 2)) * 0.08);
      const x = (hash01(s, i, 4) + Math.sin(t * 0.9 + i * 1.7) * 0.02) * W;
      const y = H + r - p * (H + r * 2);
      const a = e.alpha * Math.min(1, p * 6, (1 - p) * 3);
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = a * 0.7;
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, TAU);
      ctx.fill();
    }
  },

  rays(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const x0 = (hash01(s, i, 1) * 1.2 - 0.1) * W;
      const angle = 0.28 + (hash01(s, i, 2) - 0.5) * 0.25 + Math.sin(t * 0.3 * e.speed + i) * 0.05;
      const w = lerp(0.05, 0.18, hash01(s, i, 3)) * W;
      const grad = ctx.createLinearGradient(0, 0, 0, H * 1.25);
      grad.addColorStop(0, rgba(e.c, e.alpha));
      grad.addColorStop(1, rgba(e.c, 0));
      ctx.save();
      ctx.translate(x0, -H * 0.05);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 0.8 * e.speed + i * 2);
      ctx.fillStyle = grad;
      ctx.fillRect(-w / 2, 0, w, H * 1.3);
      ctx.restore();
    }
  },

  waves(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const baseY = H * (0.74 + i * 0.07);
      const amp = H * 0.012 * (1 + i * 0.4);
      const k = TAU / (W * (0.7 + i * 0.25));
      const phase = t * e.speed * (0.8 + 0.3 * i) * (i % 2 ? -1 : 1) + hash01(s, i, 1) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 18; x += 18) {
        ctx.lineTo(x, baseY + Math.sin(x * k + phase) * amp + Math.sin(x * k * 2.1 + phase * 1.3) * amp * 0.4);
      }
      ctx.lineTo(W + 18, H);
      ctx.closePath();
      ctx.globalAlpha = e.alpha * (0.5 + 0.25 * i);
      ctx.fillStyle = rgba(e.c, 1);
      ctx.fill();
    }
  },

  ripples(ctx, W, H, t, e) {
    ctx.strokeStyle = rgba(e.c, 1);
    ctx.lineWidth = Math.max(1, W * 0.004);
    for (let i = 0; i < e.count; i += 1) {
      const y0 = ((i + 0.5) / e.count) * H;
      ctx.globalAlpha = e.alpha * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.9));
      ctx.beginPath();
      for (let x = 0; x <= W + 16; x += 16) {
        const y =
          y0 +
          Math.sin(x * 0.012 + t * e.speed * 1.2 + i * 2) * H * 0.012 +
          Math.sin(x * 0.031 - t * e.speed * 0.9 + i) * H * 0.006;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },

  fish(ctx, W, H, t, e, s) {
    ctx.fillStyle = rgba(e.c, 1);
    for (let i = 0; i < e.count; i += 1) {
      const sz = sizeOf(e, s, i, W);
      const dir = hash01(s, i, 5) > 0.5 ? 1 : -1;
      const p = frac(hash01(s, i, 3) + t * (0.03 + 0.05 * hash01(s, i, 2)) * e.speed);
      const x = dir > 0 ? lerp(-0.15 * W, 1.15 * W, p) : lerp(1.15 * W, -0.15 * W, p);
      const y = (0.15 + 0.65 * hash01(s, i, 4)) * H + Math.sin(t * 1.5 + i) * H * 0.01;
      const flap = 1 + 0.3 * Math.sin(t * 8 + i);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = e.alpha;
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.38, 0, 0, TAU);
      ctx.moveTo(-sz * 0.8, 0);
      ctx.lineTo(-sz * 1.45, -sz * 0.42 * flap);
      ctx.lineTo(-sz * 1.45, sz * 0.42 * flap);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },

  stars(ctx, W, H, t, e, s) {
    ctx.fillStyle = rgba(e.c, 1);
    ctx.strokeStyle = rgba(e.c, 1);
    for (let i = 0; i < e.count; i += 1) {
      const x = hash01(s, i, 1) * W;
      const y = hash01(s, i, 2) * H;
      const r = sizeOf(e, s, i, W);
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + 2 * hash01(s, i, 3)) * e.speed + i * 5);
      ctx.globalAlpha = e.alpha * tw;
      if (r > W * 0.0036) {
        ctx.lineWidth = Math.max(1, r * 0.35);
        ctx.beginPath();
        ctx.moveTo(x - r * 2.2, y);
        ctx.lineTo(x + r * 2.2, y);
        ctx.moveTo(x, y - r * 2.2);
        ctx.lineTo(x, y + r * 2.2);
        ctx.stroke();
      }
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },

  shooting(ctx, W, H, t, e, s) {
    ctx.lineCap = "round";
    for (let i = 0; i < e.count; i += 1) {
      const period = (4 + hash01(s, i, 1) * 5) / e.speed;
      const shifted = t + hash01(s, i, 2) * period;
      const cycle = Math.floor(shifted / period);
      const local = shifted - cycle * period;
      const dur = 0.9;
      if (local > dur) continue;
      const p = local / dur;
      const id = i + cycle * 31;
      const x0 = (0.3 + 0.7 * hash01(s, id, 3)) * W;
      const y0 = hash01(s, id, 4) * H * 0.5;
      const len = W * (0.25 + 0.25 * hash01(s, id, 5));
      const dx = -Math.cos(0.5);
      const dy = Math.sin(0.5);
      const hx = x0 + dx * len * p * 2;
      const hy = y0 + dy * len * p * 2;
      const tx = hx - dx * len * 0.45;
      const ty = hy - dy * len * 0.45;
      const grad = ctx.createLinearGradient(hx, hy, tx, ty);
      grad.addColorStop(0, rgba(e.c, 1));
      grad.addColorStop(1, rgba(e.c, 0));
      ctx.globalAlpha = e.alpha * Math.sin(Math.PI * p);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, W * 0.004);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  },

  nebula(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const x = (hash01(s, i, 1) + Math.sin(t * 0.07 * e.speed + i * 2) * 0.08) * W;
      const y = (hash01(s, i, 2) + Math.cos(t * 0.06 * e.speed + i * 3) * 0.06) * H;
      glow(ctx, i % 2 ? e.c2 : e.c, x, y, r, e.alpha * (0.7 + 0.3 * Math.sin(t * 0.3 + i)));
    }
  },

  planet(ctx, W, H, t, e) {
    const r = e.size[0] * W;
    const cx = W * 0.76;
    const cy = H * 0.22 + Math.sin(t * 0.1 * e.speed) * H * 0.006;
    ctx.globalAlpha = e.alpha;
    const ring = (from, to) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      ctx.scale(1, 0.28);
      ctx.strokeStyle = rgba(e.c, 0.6);
      ctx.lineWidth = r * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.65, from, to);
      ctx.stroke();
      ctx.restore();
    };
    ring(Math.PI, TAU);
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, rgba(e.c, 1));
    grad.addColorStop(1, rgba(e.c2, 1));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ring(0, Math.PI);
  },

  spirits(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const p = frac(hash01(s, i, 3) + t * (0.04 + 0.05 * hash01(s, i, 2)) * e.speed);
      const x = (hash01(s, i, 4) + Math.sin(t * 0.7 * e.speed + i * 1.3) * 0.05) * W;
      const y = H * (1.05 - p * 1.2);
      const a = e.alpha * Math.sin(Math.PI * p);
      for (let k = 0; k < 4; k += 1) {
        glow(ctx, e.c, x + Math.sin(t * 1.4 + i + k * 0.6) * r * 0.3, y + k * r * 0.9, r * (1 - k * 0.18), a * (1 - k * 0.25));
      }
    }
  },

  halo(ctx, W, H, t, e) {
    glow(ctx, e.c, W * 0.5, H * 0.12, e.size[0] * W * (1 + 0.04 * Math.sin(t * 0.9 * e.speed)), e.alpha);
  },

  portal(ctx, W, H, t, e) {
    const cx = W * 0.5;
    const cy = H * 0.45;
    glow(ctx, e.c2, cx, cy, e.size[1] * W * 0.9, e.alpha * 0.35);
    ctx.lineWidth = Math.max(2, W * 0.006);
    for (let i = 0; i < e.count; i += 1) {
      const base = lerp(e.size[0], e.size[1], i / e.count) * W * (1 + 0.05 * Math.sin(t * e.speed * 1.2 + i));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * e.speed * (0.4 + 0.1 * i) * (i % 2 ? -1 : 1));
      ctx.scale(1, 1.25);
      ctx.strokeStyle = rgba(i % 2 ? e.c2 : e.c, 1);
      ctx.globalAlpha = e.alpha * (0.35 + 0.65 * (1 - i / e.count));
      ctx.setLineDash([base * 0.6, base * 0.35]);
      ctx.beginPath();
      ctx.arc(0, 0, base, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
  },

  fireflies(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const x = frac(hash01(s, i, 1) + 0.06 * Math.sin(t * 0.5 * e.speed + i * 3.1) + 0.03 * Math.sin(t * 1.3 + i)) * W;
      const y = frac(hash01(s, i, 2) + 0.05 * Math.cos(t * 0.4 * e.speed + i * 2.3) + 0.03 * Math.sin(t * 1.1 + i * 2)) * H;
      const blink = 0.5 + 0.5 * Math.sin(t * (1.2 + hash01(s, i, 3)) * 2 + i * 7);
      glow(ctx, e.c, x, y, r * (1 + blink), e.alpha * blink);
    }
  },

  snow(ctx, W, H, t, e, s) {
    ctx.fillStyle = rgba(e.c, 1);
    ctx.globalAlpha = e.alpha;
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const p = frac(hash01(s, i, 1) + t * (0.05 + 0.08 * hash01(s, i, 2)) * e.speed * (r / (e.size[1] * W) + 0.4));
      const x = (hash01(s, i, 3) + 0.03 * Math.sin(t * 0.8 + i * 2)) * W;
      ctx.beginPath();
      ctx.arc(x, p * (H + r * 2) - r, r, 0, TAU);
      ctx.fill();
    }
  },

  rain(ctx, W, H, t, e, s) {
    ctx.strokeStyle = rgba(e.c, 1);
    ctx.lineWidth = Math.max(1, W * 0.0025);
    ctx.globalAlpha = e.alpha;
    ctx.beginPath();
    for (let i = 0; i < e.count; i += 1) {
      const len = H * (0.03 + 0.04 * hash01(s, i, 4));
      const p = frac(hash01(s, i, 1) + t * (0.9 + 0.6 * hash01(s, i, 2)) * e.speed);
      const x = hash01(s, i, 3) * W * 1.2 - W * 0.1;
      const y = p * (H + len) - len;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.25, y + len);
    }
    ctx.stroke();
  },

  embers(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const p = frac(hash01(s, i, 1) + t * (0.06 + 0.1 * hash01(s, i, 2)) * e.speed);
      const x = (hash01(s, i, 3) + 0.04 * Math.sin(t * 1.5 + i * 2.3)) * W;
      const y = H * (1.02 - p * 1.1);
      const flick = 0.6 + 0.4 * Math.sin(t * 9 + i * 3);
      const col = i % 3 ? e.c : e.c2;
      glow(ctx, col, x, y, r * 4, e.alpha * flick * (1 - p));
      ctx.globalAlpha = e.alpha * flick * (1 - p);
      ctx.fillStyle = "#fff3c0";
      ctx.fillRect(x - r * 0.5, y - r * 0.5, r, r);
    }
  },

  flames(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const bx = ((i + 0.5) / e.count) * W + Math.sin(t * 2 + i) * W * 0.02;
      const hgt = H * (0.12 + 0.16 * hash01(s, i, 1)) * (0.8 + 0.3 * Math.sin(t * 7 * e.speed + i * 2.1));
      const wid = (W / e.count) * 1.7;
      const grad = ctx.createLinearGradient(0, H, 0, H - hgt);
      grad.addColorStop(0, rgba(e.c2, e.alpha));
      grad.addColorStop(0.5, rgba(e.c, e.alpha * 0.6));
      grad.addColorStop(1, rgba(e.c, 0));
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(bx - wid / 2, H);
      ctx.quadraticCurveTo(bx - wid * 0.15, H - hgt * 0.5, bx + Math.sin(t * 3 + i) * wid * 0.2, H - hgt);
      ctx.quadraticCurveTo(bx + wid * 0.15, H - hgt * 0.5, bx + wid / 2, H);
      ctx.fill();
    }
  },

  sparkles(ctx, W, H, t, e, s) {
    ctx.strokeStyle = rgba(e.c, 1);
    ctx.lineWidth = Math.max(1, W * 0.0018);
    for (let i = 0; i < e.count; i += 1) {
      const x = hash01(s, i, 1) * W;
      const y = hash01(s, i, 2) * H;
      const ph = frac(t * (0.3 + 0.5 * hash01(s, i, 3)) * e.speed + hash01(s, i, 4));
      const tw = Math.sin(Math.PI * ph) ** 2;
      const r = sizeOf(e, s, i, W) * tw;
      if (r < 0.5) continue;
      glow(ctx, e.c, x, y, r * 1.8, e.alpha * 0.6 * tw);
      ctx.globalAlpha = e.alpha * tw;
      ctx.beginPath();
      ctx.moveTo(x - r * 1.6, y);
      ctx.lineTo(x + r * 1.6, y);
      ctx.moveTo(x, y - r * 1.6);
      ctx.lineTo(x, y + r * 1.6);
      ctx.stroke();
    }
  },

  petals: falling("petal"),
  leaves: falling("leaf"),
  confetti: falling("confetti"),

  dust(ctx, W, H, t, e, s) {
    ctx.fillStyle = rgba(e.c, 1);
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const x = frac(hash01(s, i, 1) + t * 0.01 * e.speed * (hash01(s, i, 2) - 0.3) + 0.02 * Math.sin(t * 0.4 + i)) * W;
      const y = frac(hash01(s, i, 3) - t * 0.012 * e.speed * (0.4 + hash01(s, i, 4)) + 0.02 * Math.cos(t * 0.5 + i)) * H;
      ctx.globalAlpha = e.alpha * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.6 + i * 3)));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  },

  lightning(ctx, W, H, t, e, s) {
    const period = 5 / e.speed;
    const cycle = Math.floor(t / period);
    const d = t - cycle * period - hash01(s, cycle, 1) * (period - 1.2);
    if (d < 0 || d > 0.5) return;
    const flash = d < 0.08 ? 1 : d < 0.14 ? 0.2 : d < 0.2 ? 0.8 : Math.max(0, 1 - (d - 0.2) / 0.3) * 0.5;
    ctx.globalAlpha = flash * 0.35 * e.alpha;
    ctx.fillStyle = rgba(e.c, 1);
    ctx.fillRect(0, 0, W, H);
    if (d > 0.2) return;
    let x = (0.2 + 0.6 * hash01(s, cycle, 2)) * W;
    const steps = 14;
    const bolt = [[x, 0]];
    for (let i = 1; i <= steps; i += 1) {
      x += (hash01(s, cycle * 40 + i, 7) - 0.5) * W * 0.12;
      bolt.push([x, (H * 0.75 * i) / steps]);
    }
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(e.c, 1);
    for (const [width, alpha] of [[W * 0.02, 0.25], [W * 0.006, 1]]) {
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha * e.alpha;
      ctx.beginPath();
      bolt.forEach(([bx, by], idx) => (idx ? ctx.lineTo(bx, by) : ctx.moveTo(bx, by)));
      ctx.stroke();
    }
  },

  aurora(ctx, W, H, t, e) {
    for (let i = 0; i < e.count; i += 1) {
      const baseY = H * (0.12 + 0.1 * i);
      const amp = H * 0.05;
      const grad = ctx.createLinearGradient(0, baseY - amp, 0, baseY + H * 0.4);
      grad.addColorStop(0, rgba(i % 2 ? e.c2 : e.c, e.alpha));
      grad.addColorStop(1, rgba(i % 2 ? e.c2 : e.c, 0));
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 0.5 + i);
      ctx.beginPath();
      ctx.moveTo(0, baseY + H * 0.4);
      for (let x = 0; x <= W + 24; x += 24) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.006 + t * 0.4 * e.speed + i * 2) * amp + Math.sin(x * 0.013 - t * 0.3 * e.speed + i) * amp * 0.5);
      }
      ctx.lineTo(W + 24, baseY + H * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  },

  fog(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const x = frac(hash01(s, i, 1) + t * 0.012 * e.speed * (1 + hash01(s, i, 5))) * W * 1.6 - W * 0.3;
      const y = H * (0.45 + 0.55 * hash01(s, i, 2));
      glow(ctx, e.c, x, y, r, e.alpha);
    }
  },

  glitch(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const period = 1.3 + hash01(s, i, 1) * 2.2;
      const shifted = t * e.speed + hash01(s, i, 2) * period;
      const cycle = Math.floor(shifted / period);
      if (shifted - cycle * period > 0.14) continue;
      const id = cycle * 7 + i;
      const y = hash01(s, id, 3) * H;
      const h = (0.01 + 0.05 * hash01(s, id, 4)) * H;
      const dx = (hash01(s, id, 5) - 0.5) * W * 0.12;
      ctx.globalAlpha = 1;
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
      ctx.globalAlpha = e.alpha * 0.5;
      ctx.fillStyle = rgba(i % 2 ? e.c : e.c2, 1);
      ctx.fillRect(0, y, W, Math.max(2, h * 0.12));
    }
  },

  scanlines(ctx, W, H, t, e) {
    ctx.fillStyle = rgba(e.c, 1);
    ctx.globalAlpha = e.alpha;
    const step = Math.max(3, Math.round(H / 300) * 2);
    for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, step / 2);
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, frac(t * 0.1 * e.speed) * H, W, H * 0.06);
  },

  hearts(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const p = frac(hash01(s, i, 1) + t * (0.05 + 0.06 * hash01(s, i, 2)) * e.speed);
      const x = (hash01(s, i, 3) + 0.05 * Math.sin(t * 0.9 + i * 1.9)) * W;
      const y = H * (1.05 - p * 1.15);
      ctx.globalAlpha = e.alpha * Math.sin(Math.PI * p);
      ctx.fillStyle = rgba(e.c, 1);
      heartPath(ctx, x, y, r);
      ctx.fill();
    }
  },

  bokeh(ctx, W, H, t, e, s) {
    for (let i = 0; i < e.count; i += 1) {
      const r = sizeOf(e, s, i, W);
      const x = frac(hash01(s, i, 1) + t * 0.01 * e.speed * (hash01(s, i, 2) - 0.5) * 4) * W;
      const y = frac(hash01(s, i, 3) - t * 0.015 * e.speed * (0.3 + hash01(s, i, 4))) * H;
      const col = i % 2 ? e.c : e.c2;
      const a = e.alpha * (0.6 + 0.4 * Math.sin(t * 0.7 + i * 2.1));
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(col, 0.55);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = rgba(col, 1);
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.stroke();
    }
  },

  synthgrid(ctx, W, H, t, e) {
    const horizon = H * 0.62;
    const R = W * 0.28;
    const cy = horizon - R * 0.1;
    // Soleil rétro à bandes.
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, cy, R, 0, TAU);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    sun.addColorStop(0, rgba(e.c2, e.alpha));
    sun.addColorStop(1, rgba(e.c, e.alpha));
    ctx.fillStyle = sun;
    const rows = 12;
    for (let j = 0; j < rows; j += 1) {
      const y = cy - R + (j * 2 * R) / rows;
      const h = ((2 * R) / rows) * (j < rows / 2 ? 1 : 1 - (j - rows / 2) / rows * 1.6);
      ctx.fillRect(W / 2 - R, y, R * 2, Math.max(1, h * 0.85));
    }
    ctx.restore();
    // Sol sombre + grille en perspective.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.globalAlpha = e.alpha;
    ctx.strokeStyle = rgba(e.c, 1);
    ctx.lineWidth = Math.max(1.5, W * 0.003);
    ctx.beginPath();
    for (let k = -9; k <= 9; k += 1) {
      ctx.moveTo(W / 2 + k * W * 0.02, horizon);
      ctx.lineTo(W / 2 + k * W * 0.22, H);
    }
    for (let j = 0; j < e.count; j += 1) {
      const z = frac(j / e.count + t * 0.15 * e.speed);
      const y = horizon + (H - horizon) * z * z;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  },

  code(ctx, W, H, t, e, s) {
    const fs = Math.round(e.size[0] * W);
    const chars = "01アイウエオカキクケコサシスセソ<>{}=+*";
    ctx.font = `${fs}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tail = 9;
    for (let i = 0; i < e.count; i += 1) {
      const x = ((i + 0.5) / e.count) * W;
      const head = frac(t * (0.2 + 0.4 * hash01(s, i, 1)) * e.speed * 0.5 + hash01(s, i, 2)) * (H * 1.4) - H * 0.2;
      for (let k = 0; k < tail; k += 1) {
        const y = head - k * fs;
        if (y < -fs || y > H) continue;
        ctx.globalAlpha = e.alpha * (1 - k / tail);
        ctx.fillStyle = k === 0 ? "#eafff2" : rgba(e.c, 1);
        ctx.fillText(chars[(Math.floor(t * 10) + i * 7 + k * 3) % chars.length], x, y);
      }
    }
  },
};
