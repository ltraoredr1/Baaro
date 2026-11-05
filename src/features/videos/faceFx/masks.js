import { makeRng, rgbToHex, rotateHue, toRgb } from "../filters/utils.js";

// Têtes d'animaux et accessoires dessinés en vectoriel (aucune image à charger).
// Repère de dessin : 1 unité = demi-largeur du visage, y vers le bas, origine = centre du
// visage. Les yeux / nez / bouche sont posés sur les vrais points du visage (F).

const TAU = Math.PI * 2;
const tint = (hex, hue) => (hue ? rgbToHex(rotateHue(toRgb(hex), hue)) : hex);

const ell = (c, x, y, rx, ry, color, rot = 0) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fillStyle = color;
  c.fill();
};
const poly = (c, pts, color) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = color;
  c.fill();
};
const line = (c, pts, color, w) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
};
const vgrad = (c, y0, y1, a, b) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
};
const rgrad = (c, r, a, b) => {
  const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
};

// Les visages plus longs que la moyenne allongent un peu la tête de l'animal.
let stretch = 1;

// Tête de base (ellipse dégradée).
const head = (c, P, rx = 1.3, ry0 = 1.4, y0 = -0.05) => {
  const ry = ry0 * stretch;
  const y = y0 * stretch;
  c.beginPath();
  c.ellipse(0, y, rx, ry, 0, 0, TAU);
  c.fillStyle = vgrad(c, y - ry, y + ry, P.light || P.fur, P.fur);
  c.fill();
};

const eye = (c, F, side, r, P, opts = {}) => {
  const e = F.eyes[side];
  const x = opts.x ?? e.x;
  const y = opts.y ?? e.y;
  if (F.blink > 0.55) {
    line(c, [[x - r, y], [x, y + r * 0.35], [x + r, y]], P.line || "#2a1a14", r * 0.28);
    return;
  }
  ell(c, x, y, r, r * 1.08, opts.sclera || "#fff");
  const look = -Math.sign(x) * r * 0.12;
  ell(c, x + look, y + r * 0.05, r * 0.62, r * 0.7, opts.iris || P.iris || "#2b1b12");
  ell(c, x + look, y + r * 0.05, r * 0.32, r * 0.38, "#000");
  ell(c, x + look + r * 0.2, y - r * 0.22, r * 0.2, r * 0.2, "#fff");
};

const mouth = (c, F, x, y, w, P, opts = {}) => {
  const open = F.mouth;
  if (open < 0.12) {
    line(c, [[x - w * 0.5, y - w * 0.04], [x - w * 0.22, y + w * 0.12], [x, y], [x + w * 0.22, y + w * 0.12], [x + w * 0.5, y - w * 0.04]], P.line || "#3a1d14", w * 0.09);
    return;
  }
  const h = w * (0.12 + open * 0.75);
  c.beginPath();
  c.ellipse(x, y + h * 0.45, w * 0.5, h * 0.55 + w * 0.05, 0, 0, TAU);
  c.fillStyle = "#4a0f1a";
  c.fill();
  if (opts.tongue !== false) ell(c, x, y + h * 0.85, w * 0.28, h * 0.28 + 0.02, "#ff7a8e");
};

const whiskers = (c, x, y, len, color = "#ffffffcc", w = 0.035) => {
  [-1, 1].forEach((s) => {
    [-0.14, 0, 0.14].forEach((dy) => {
      line(c, [[s * x, y], [s * (x + len), y + dy * len * 1.6]], color, w);
    });
  });
};

const earPair = (c, fn) => [-1, 1].forEach((s) => {
  c.save();
  c.scale(s, 1);
  fn();
  c.restore();
});

// ───────────────────────── Animaux ─────────────────────────
// Chaque dessinateur : (c, F, P) avec P = palette déjà teintée.
const ANIMALS = {
  chat: {
    emoji: "🐱", label: "Chat", sw: ["#ffc27a", "#d9822b"],
    pal: { fur: "#f0a64a", light: "#ffc680", dark: "#c9772a", inner: "#ff9fb2", nose: "#ff7a95", iris: "#3c8a3a" },
    draw(c, F, P) {
      earPair(c, () => {
        poly(c, [[0.35, -1.0], [1.15, -1.75], [1.35, -0.45]], P.fur);
        poly(c, [[0.55, -0.95], [1.08, -1.4], [1.2, -0.62]], P.inner);
      });
      head(c, P);
      [-1, 1].forEach((s) => [0, 1, 2].forEach((i) => {
        line(c, [[s * (0.2 + i * 0.22), -1.3], [s * (0.2 + i * 0.22) + s * 0.04, -0.95]], P.dark, 0.09);
      }));
      ell(c, 0, 0.55, 0.62, 0.5, P.light === P.fur ? "#fff" : "#fff1dd");
      eye(c, F, 0, 0.23, P);
      eye(c, F, 1, 0.23, P);
      poly(c, [[-0.13, 0.28], [0.13, 0.28], [0, 0.42]], P.nose);
      mouth(c, F, 0, 0.68, 0.55, P);
      whiskers(c, 0.55, 0.52, 0.85);
    },
  },
  chien: {
    emoji: "🐶", label: "Chien", sw: ["#e8c9a0", "#8a5a2b"],
    pal: { fur: "#d9a066", light: "#efc896", dark: "#7a4a22", nose: "#1f1612", iris: "#4a2a12" },
    draw(c, F, P) {
      earPair(c, () => {
        c.save();
        c.rotate(0.25);
        ell(c, 1.35, -0.2, 0.42, 0.95, P.dark);
        c.restore();
      });
      head(c, P);
      ell(c, -0.62, -0.2, 0.42, 0.45, P.dark);
      ell(c, 0, 0.58, 0.72, 0.58, "#f8e7cf");
      eye(c, F, 0, 0.22, P);
      eye(c, F, 1, 0.22, P);
      ell(c, 0, 0.32, 0.26, 0.19, P.nose);
      ell(c, -0.07, 0.27, 0.07, 0.04, "#ffffff88");
      mouth(c, F, 0, 0.78, 0.55, P);
    },
  },
  lapin: {
    emoji: "🐰", label: "Lapin", sw: ["#fbe6ef", "#e9a3c0"],
    pal: { fur: "#f4efe9", light: "#ffffff", dark: "#d8cfc5", inner: "#ffb6cc", nose: "#ff8fb0", iris: "#7a2a3a" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 0.5, -2.25, 0.34, 1.15, P.fur, 0.1);
        ell(c, 0.5, -2.2, 0.19, 0.92, P.inner, 0.1);
      });
      head(c, P);
      ell(c, 0, 0.55, 0.55, 0.42, "#fff");
      eye(c, F, 0, 0.21, P);
      eye(c, F, 1, 0.21, P);
      poly(c, [[-0.1, 0.3], [0.1, 0.3], [0, 0.4]], P.nose);
      mouth(c, F, 0, 0.62, 0.42, P, { tongue: false });
      if (F.mouth < 0.12) {
        c.fillStyle = "#fff";
        c.fillRect(-0.12, 0.64, 0.11, 0.2);
        c.fillRect(0.01, 0.64, 0.11, 0.2);
        c.strokeStyle = "#cfc4ba";
        c.lineWidth = 0.02;
        c.strokeRect(-0.12, 0.64, 0.11, 0.2);
        c.strokeRect(0.01, 0.64, 0.11, 0.2);
      }
      whiskers(c, 0.5, 0.5, 0.7, "#c9bdb2");
    },
  },
  ours: {
    emoji: "🐻", label: "Ours", sw: ["#c99a6b", "#6b4423"],
    pal: { fur: "#a8744a", light: "#c4905f", dark: "#6b4423", inner: "#d9a77a", nose: "#2a1810", iris: "#2a1810" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 0.95, -1.05, 0.42, 0.42, P.fur);
        ell(c, 0.95, -1.05, 0.24, 0.24, P.inner);
      });
      head(c, P);
      ell(c, 0, 0.55, 0.62, 0.5, "#e6c39d");
      eye(c, F, 0, 0.17, P, { sclera: "#f6eadb" });
      eye(c, F, 1, 0.17, P, { sclera: "#f6eadb" });
      ell(c, 0, 0.33, 0.22, 0.15, P.nose);
      mouth(c, F, 0, 0.68, 0.5, P);
    },
  },
  panda: {
    emoji: "🐼", label: "Panda", sw: ["#f2f2f2", "#222"],
    pal: { fur: "#f6f6f6", light: "#ffffff", dark: "#1c1c1c", nose: "#1c1c1c", iris: "#1c1c1c" },
    draw(c, F, P) {
      earPair(c, () => ell(c, 0.98, -1.1, 0.45, 0.45, P.dark));
      head(c, P);
      [0, 1].forEach((i) => {
        const e = F.eyes[i];
        c.save();
        c.translate(e.x, e.y + 0.05);
        c.rotate(-Math.sign(e.x) * 0.5);
        ell(c, 0, 0, 0.28, 0.4, P.dark);
        c.restore();
      });
      eye(c, F, 0, 0.14, P, { sclera: "#fff" });
      eye(c, F, 1, 0.14, P, { sclera: "#fff" });
      ell(c, 0, 0.42, 0.2, 0.14, P.nose);
      mouth(c, F, 0, 0.72, 0.5, P);
    },
  },
  renard: {
    emoji: "🦊", label: "Renard", sw: ["#ff9a4d", "#c2410c"],
    pal: { fur: "#ee7b2a", light: "#f59a4a", dark: "#2a1a14", inner: "#fff2e0", nose: "#1c1c1c", iris: "#5a2d0c" },
    draw(c, F, P) {
      earPair(c, () => {
        poly(c, [[0.3, -1.0], [1.05, -2.05], [1.4, -0.4]], P.fur);
        poly(c, [[0.62, -1.4], [1.05, -2.05], [1.2, -1.2]], P.dark);
        poly(c, [[0.62, -0.95], [1.0, -1.45], [1.15, -0.65]], P.inner);
      });
      head(c, P);
      earPair(c, () => poly(c, [[0.1, 0.3], [1.35, -0.05], [1.0, 0.95]], P.inner));
      poly(c, [[-0.4, 0.2], [0.4, 0.2], [0, 1.15]], P.inner);
      eye(c, F, 0, 0.2, P, { sclera: "#fff6df" });
      eye(c, F, 1, 0.2, P, { sclera: "#fff6df" });
      ell(c, 0, 0.62, 0.15, 0.11, P.nose);
      mouth(c, F, 0, 0.92, 0.4, P);
    },
  },
  lion: {
    emoji: "🦁", label: "Lion", sw: ["#ffcf6b", "#b45309"],
    pal: { fur: "#e9b04f", light: "#f7cf7a", dark: "#8a4a12", mane: "#a0561a", nose: "#4a2a1a", iris: "#4a2a0a" },
    draw(c, F, P) {
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * TAU;
        ell(c, Math.cos(a) * 1.35, Math.sin(a) * 1.45 - 0.05, 0.6, 0.6, i % 2 ? P.mane : P.dark);
      }
      ell(c, 0, -0.05, 1.5, 1.6, P.mane);
      earPair(c, () => ell(c, 0.95, -1.15, 0.3, 0.3, P.fur));
      head(c, P, 1.12, 1.22);
      ell(c, 0, 0.5, 0.58, 0.48, "#fbe6bd");
      eye(c, F, 0, 0.2, P, { sclera: "#fff6df" });
      eye(c, F, 1, 0.2, P, { sclera: "#fff6df" });
      poly(c, [[-0.16, 0.25], [0.16, 0.25], [0, 0.42]], P.nose);
      mouth(c, F, 0, 0.66, 0.5, P);
    },
  },
  tigre: {
    emoji: "🐯", label: "Tigre", sw: ["#ffb347", "#c2410c"],
    pal: { fur: "#f08a24", light: "#f7a94a", dark: "#2a1a10", nose: "#ff7a95", iris: "#3a8a2a" },
    draw(c, F, P) {
      earPair(c, () => ell(c, 0.95, -1.1, 0.4, 0.4, P.fur));
      head(c, P);
      for (let i = 0; i < 3; i += 1) {
        earPair(c, () => {
          line(c, [[0.1 + i * 0.28, -1.38], [0.22 + i * 0.28, -0.98]], P.dark, 0.1);
          line(c, [[1.05, -0.35 + i * 0.35], [1.28, -0.2 + i * 0.35]], P.dark, 0.1);
        });
      }
      ell(c, 0, 0.55, 0.66, 0.52, "#fff4e0");
      eye(c, F, 0, 0.21, P, { sclera: "#fff6df" });
      eye(c, F, 1, 0.21, P, { sclera: "#fff6df" });
      poly(c, [[-0.14, 0.28], [0.14, 0.28], [0, 0.43]], P.nose);
      mouth(c, F, 0, 0.7, 0.5, P);
      whiskers(c, 0.55, 0.55, 0.8);
    },
  },
  singe: {
    emoji: "🐵", label: "Singe", sw: ["#c8956a", "#6b4423"],
    pal: { fur: "#8a5a35", light: "#a9724a", dark: "#4a2d18", inner: "#f2c9a0", nose: "#3a2418", iris: "#2a1a10" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 1.3, 0.0, 0.42, 0.45, P.fur);
        ell(c, 1.3, 0.0, 0.26, 0.28, P.inner);
      });
      head(c, P);
      ell(c, -0.38, 0.15, 0.55, 0.5, P.inner);
      ell(c, 0.38, 0.15, 0.55, 0.5, P.inner);
      ell(c, 0, 0.62, 0.7, 0.5, P.inner);
      eye(c, F, 0, 0.18, P);
      eye(c, F, 1, 0.18, P);
      ell(c, -0.08, 0.38, 0.05, 0.035, P.nose);
      ell(c, 0.08, 0.38, 0.05, 0.035, P.nose);
      mouth(c, F, 0, 0.74, 0.5, P);
    },
  },
  cochon: {
    emoji: "🐷", label: "Cochon", sw: ["#ffc2d4", "#e0678a"],
    pal: { fur: "#f9a8c0", light: "#fcc4d6", dark: "#d9688a", nose: "#f27a9c", iris: "#4a1a2a" },
    draw(c, F, P) {
      earPair(c, () => poly(c, [[0.3, -1.05], [1.25, -1.5], [1.45, -0.35]], P.dark));
      head(c, P);
      eye(c, F, 0, 0.19, P);
      eye(c, F, 1, 0.19, P);
      ell(c, 0, 0.5, 0.5, 0.38, P.nose);
      ell(c, -0.17, 0.5, 0.075, 0.14, "#8a2a48");
      ell(c, 0.17, 0.5, 0.075, 0.14, "#8a2a48");
      mouth(c, F, 0, 0.98, 0.45, P);
    },
  },
  grenouille: {
    emoji: "🐸", label: "Grenouille", sw: ["#9be37a", "#2f8a2f"],
    pal: { fur: "#5cc24a", light: "#86dc6a", dark: "#2f8a2f", nose: "#2f8a2f", iris: "#1a1a1a" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 0.62, -1.15, 0.5, 0.5, P.fur);
        ell(c, 0.62, -1.15, 0.38, 0.38, "#fff");
        ell(c, 0.62, -1.15, 0.2, 0.22, "#1a1a1a");
        ell(c, 0.68, -1.22, 0.07, 0.07, "#fff");
      });
      head(c, P, 1.35, 1.2, 0.05);
      ell(c, -0.12, 0.2, 0.025, 0.025, P.dark);
      ell(c, 0.12, 0.2, 0.025, 0.025, P.dark);
      mouth(c, F, 0, 0.7, 1.15, P);
      ell(c, -0.85, 0.45, 0.2, 0.15, "#ff8a8a88");
      ell(c, 0.85, 0.45, 0.2, 0.15, "#ff8a8a88");
    },
  },
  hibou: {
    emoji: "🦉", label: "Hibou", sw: ["#caa57a", "#6b4a2a"],
    pal: { fur: "#9a6f45", light: "#b88a5c", dark: "#5a3a1f", disc: "#f4e3c4", nose: "#f2a516", iris: "#e8a010" },
    draw(c, F, P) {
      earPair(c, () => poly(c, [[0.3, -1.15], [1.1, -1.85], [1.25, -0.8]], P.dark));
      head(c, P);
      [0, 1].forEach((i) => {
        const e = F.eyes[i];
        ell(c, e.x, e.y, 0.5, 0.52, P.disc);
        ell(c, e.x, e.y, 0.5, 0.52, "#00000000");
      });
      eye(c, F, 0, 0.32, P, { sclera: "#fffbe8", iris: "#e8a010" });
      eye(c, F, 1, 0.32, P, { sclera: "#fffbe8", iris: "#e8a010" });
      poly(c, [[-0.16, 0.3], [0.16, 0.3], [0, 0.7]], P.nose);
      for (let i = 0; i < 3; i += 1) line(c, [[-0.5 + i * 0.5, 0.95], [-0.45 + i * 0.5, 1.15]], P.dark, 0.07);
    },
  },
  elephant: {
    emoji: "🐘", label: "Éléphant", sw: ["#c3cad6", "#6b7688"],
    pal: { fur: "#9aa5b8", light: "#b4bdcc", dark: "#6e7a8e", inner: "#e9b6c0", nose: "#8a95a8", iris: "#2a2f3a" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 1.55, -0.05, 0.85, 1.15, P.dark);
        ell(c, 1.5, -0.05, 0.62, 0.9, P.inner);
      });
      head(c, P);
      eye(c, F, 0, 0.17, P);
      eye(c, F, 1, 0.17, P);
      // trompe
      c.beginPath();
      c.moveTo(-0.38, 0.2);
      c.quadraticCurveTo(-0.42, 1.55, 0.0, 1.9);
      c.quadraticCurveTo(0.42, 1.55, 0.38, 0.2);
      c.closePath();
      c.fillStyle = vgrad(c, 0.2, 1.9, P.light, P.fur);
      c.fill();
      for (let i = 0; i < 4; i += 1) line(c, [[-0.34, 0.6 + i * 0.28], [0.34, 0.6 + i * 0.28]], P.dark, 0.035);
      earPair(c, () => poly(c, [[0.45, 0.85], [0.95, 1.3], [0.62, 1.05]], "#fff6e0"));
    },
  },
  vache: {
    emoji: "🐮", label: "Vache", sw: ["#fff", "#8a8a8a"],
    pal: { fur: "#fbfbfb", light: "#fff", dark: "#2a2a2a", nose: "#f7b5c0", iris: "#2a1a10", horn: "#f4e4b8" },
    draw(c, F, P) {
      earPair(c, () => {
        poly(c, [[0.55, -1.2], [0.8, -1.75], [1.0, -1.15]], P.horn);
        c.save();
        c.rotate(-0.35);
        ell(c, 1.45, -0.6, 0.55, 0.28, P.fur);
        ell(c, 1.45, -0.6, 0.38, 0.17, "#f7b5c0");
        c.restore();
      });
      head(c, P);
      ell(c, -0.7, -0.75, 0.42, 0.34, P.dark);
      ell(c, 0.55, 0.05, 0.3, 0.5, P.dark);
      ell(c, 0, 0.7, 0.78, 0.55, P.nose);
      eye(c, F, 0, 0.2, P);
      eye(c, F, 1, 0.2, P);
      ell(c, -0.3, 0.68, 0.09, 0.12, "#a8455a");
      ell(c, 0.3, 0.68, 0.09, 0.12, "#a8455a");
      mouth(c, F, 0, 1.0, 0.4, P);
    },
  },
  licorne: {
    emoji: "🦄", label: "Licorne", sw: ["#fbc8ff", "#7c3aed"],
    pal: { fur: "#fdf6ff", light: "#ffffff", dark: "#c9a4e8", mane: "#ff8fd0", mane2: "#8fb0ff", nose: "#ff9fc4", iris: "#7a3acf", horn: "#ffd86b" },
    draw(c, F, P) {
      earPair(c, () => {
        for (let i = 0; i < 4; i += 1) ell(c, 1.15 + i * 0.05, -0.6 + i * 0.5, 0.42, 0.5, i % 2 ? P.mane : P.mane2);
      });
      earPair(c, () => poly(c, [[0.55, -1.15], [0.95, -1.8], [1.05, -1.0]], P.fur));
      head(c, P);
      poly(c, [[-0.2, -1.2], [0.2, -1.2], [0, -2.5]], P.horn);
      for (let i = 0; i < 4; i += 1) line(c, [[-0.17 + i * 0.03, -1.45 - i * 0.28], [0.17 - i * 0.03, -1.55 - i * 0.28]], "#e8b83a", 0.05);
      ell(c, -0.2, -1.15, 0.5, 0.35, P.mane);
      ell(c, 0.25, -1.1, 0.5, 0.33, P.mane2);
      eye(c, F, 0, 0.22, P);
      eye(c, F, 1, 0.22, P);
      ell(c, -0.07, 0.4, 0.04, 0.03, P.dark);
      ell(c, 0.07, 0.4, 0.04, 0.03, P.dark);
      ell(c, -0.75, 0.4, 0.2, 0.13, "#ff9fc488");
      ell(c, 0.75, 0.4, 0.2, 0.13, "#ff9fc488");
      mouth(c, F, 0, 0.7, 0.5, P);
    },
  },
  souris: {
    emoji: "🐭", label: "Souris", sw: ["#d9d9e0", "#7a7a88"],
    pal: { fur: "#b9b9c4", light: "#d4d4dc", dark: "#8a8a98", inner: "#ffb6c8", nose: "#ff8fa8", iris: "#2a2a30" },
    draw(c, F, P) {
      earPair(c, () => {
        ell(c, 1.05, -1.1, 0.7, 0.7, P.fur);
        ell(c, 1.05, -1.1, 0.5, 0.5, P.inner);
      });
      head(c, P);
      ell(c, 0, 0.55, 0.55, 0.45, "#eaeaf0");
      eye(c, F, 0, 0.2, P);
      eye(c, F, 1, 0.2, P);
      ell(c, 0, 0.38, 0.14, 0.1, P.nose);
      mouth(c, F, 0, 0.7, 0.42, P, { tongue: false });
      whiskers(c, 0.45, 0.55, 0.85, "#ffffffdd");
    },
  },
};

// ───────────────────────── Accessoires ─────────────────────────
const ACCESSORIES = {
  couronne: {
    emoji: "👑", label: "Couronne", sw: ["#ffe27a", "#c9921a"],
    draw(c, F, hue) {
      const y = F.top - 0.08;
      poly(c, [[-0.85, y], [-0.85, y - 0.55], [-0.45, y - 0.25], [0, y - 0.7], [0.45, y - 0.25], [0.85, y - 0.55], [0.85, y]], tint("#f7c531", hue));
      c.fillStyle = tint("#c9921a", hue);
      c.fillRect(-0.85, y - 0.1, 1.7, 0.12);
      [[-0.85, y - 0.55], [0, y - 0.7], [0.85, y - 0.55]].forEach(([x, yy]) => ell(c, x, yy, 0.09, 0.09, "#ff4d6d"));
      ell(c, 0, y - 0.3, 0.08, 0.08, "#4dabff");
    },
  },
  lunettes: {
    emoji: "🕶️", label: "Lunettes", sw: ["#444", "#111"],
    draw(c, F, hue) {
      const [a, b] = F.eyes;
      const col = tint("#14141a", hue);
      [a, b].forEach((e) => {
        c.beginPath();
        c.roundRect ? c.roundRect(e.x - 0.42, e.y - 0.26, 0.84, 0.55, 0.2) : c.rect(e.x - 0.42, e.y - 0.26, 0.84, 0.55);
        c.fillStyle = col;
        c.fill();
        ell(c, e.x - 0.15, e.y - 0.1, 0.12, 0.05, "#ffffff55", -0.4);
      });
      line(c, [[a.x + 0.42, a.y - 0.05], [b.x - 0.42, b.y - 0.05]], col, 0.07);
      line(c, [[a.x - 0.42, a.y - 0.05], [a.x - 0.95, a.y - 0.12]], col, 0.06);
      line(c, [[b.x + 0.42, b.y - 0.05], [b.x + 0.95, b.y - 0.12]], col, 0.06);
    },
  },
  moustache: {
    emoji: "🥸", label: "Moustache", sw: ["#6b4a2a", "#2a1a0f"],
    draw(c, F, hue) {
      const y = (F.nose.y + F.mouth0.y) / 2 + 0.05;
      const col = tint("#3a2414", hue);
      earPair(c, () => {
        c.beginPath();
        c.moveTo(0, y - 0.05);
        c.bezierCurveTo(0.25, y - 0.22, 0.75, y - 0.1, 0.95, y + 0.2);
        c.bezierCurveTo(0.6, y + 0.1, 0.3, y + 0.15, 0, y + 0.12);
        c.closePath();
        c.fillStyle = col;
        c.fill();
      });
    },
  },
  "nez-clown": {
    emoji: "🤡", label: "Nez de clown", sw: ["#ff8a8a", "#d11"],
    draw(c, F, hue) {
      const g = c.createRadialGradient(F.nose.x - 0.07, F.nose.y - 0.07, 0.02, F.nose.x, F.nose.y, 0.3);
      g.addColorStop(0, tint("#ff8a8a", hue));
      g.addColorStop(1, tint("#d41a1a", hue));
      c.beginPath();
      c.arc(F.nose.x, F.nose.y, 0.28, 0, TAU);
      c.fillStyle = g;
      c.fill();
    },
  },
  cornes: {
    emoji: "😈", label: "Cornes", sw: ["#ff6b6b", "#7a0a0a"],
    draw(c, F, hue) {
      const y = F.top;
      earPair(c, () => {
        c.beginPath();
        c.moveTo(0.35, y + 0.1);
        c.quadraticCurveTo(0.45, y - 0.7, 0.95, y - 0.85);
        c.quadraticCurveTo(0.78, y - 0.35, 0.78, y + 0.15);
        c.closePath();
        c.fillStyle = tint("#d61f2c", hue);
        c.fill();
      });
    },
  },
  aureole: {
    emoji: "😇", label: "Auréole", sw: ["#fff3b0", "#f0b429"],
    draw(c, F, hue) {
      c.beginPath();
      c.ellipse(0, F.top - 0.45, 0.8, 0.2, 0, 0, TAU);
      c.strokeStyle = tint("#ffd54a", hue);
      c.lineWidth = 0.14;
      c.stroke();
      c.strokeStyle = "#fff6c4";
      c.lineWidth = 0.04;
      c.stroke();
    },
  },
  cowboy: {
    emoji: "🤠", label: "Cowboy", sw: ["#c8935a", "#6b3f1a"],
    draw(c, F, hue) {
      const y = F.top + 0.02;
      const col = tint("#a8703a", hue);
      ell(c, 0, y, 1.9, 0.22, col);
      c.beginPath();
      c.moveTo(-0.85, y - 0.02);
      c.quadraticCurveTo(-0.9, y - 0.85, -0.3, y - 0.85);
      c.quadraticCurveTo(0, y - 0.6, 0.3, y - 0.85);
      c.quadraticCurveTo(0.9, y - 0.85, 0.85, y - 0.02);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.fillStyle = tint("#5a331a", hue);
      c.fillRect(-0.86, y - 0.22, 1.72, 0.14);
    },
  },
  noel: {
    emoji: "🎅", label: "Bonnet de Noël", sw: ["#ff5a5a", "#a10f1f"],
    draw(c, F, hue) {
      const y = F.top + 0.05;
      c.beginPath();
      c.moveTo(-1.0, y);
      c.quadraticCurveTo(-0.8, y - 1.3, 0.9, y - 1.25);
      c.quadraticCurveTo(1.2, y - 0.6, 1.0, y);
      c.closePath();
      c.fillStyle = tint("#d9232f", hue);
      c.fill();
      ell(c, 0, y, 1.2, 0.2, "#fff");
      ell(c, 0.95, y - 1.3, 0.2, 0.2, "#fff");
    },
  },
  "oreilles-chat": {
    emoji: "😺", label: "Oreilles de chat", sw: ["#ffd1e0", "#e0678a"],
    draw(c, F, hue) {
      const y = F.top;
      earPair(c, () => {
        poly(c, [[0.2, y + 0.2], [0.75, y - 0.85], [1.1, y + 0.3]], tint("#2b2b33", hue));
        poly(c, [[0.4, y + 0.1], [0.75, y - 0.5], [0.95, y + 0.2]], tint("#ff9fb2", hue));
      });
      poly(c, [[-0.1, F.nose.y - 0.05], [0.1, F.nose.y - 0.05], [0, F.nose.y + 0.08]], tint("#ff7a95", hue));
      whiskers(c, 0.55, F.nose.y + 0.12, 0.75, "#ffffffdd");
    },
  },
  "oreilles-lapin": {
    emoji: "🐇", label: "Oreilles de lapin", sw: ["#fbe6ef", "#e9a3c0"],
    draw(c, F, hue) {
      const y = F.top;
      earPair(c, () => {
        ell(c, 0.5, y - 0.95, 0.3, 1.0, tint("#f4efe9", hue), 0.12);
        ell(c, 0.5, y - 0.9, 0.17, 0.8, tint("#ffb6cc", hue), 0.12);
      });
    },
  },
  fleurs: {
    emoji: "🌸", label: "Couronne de fleurs", sw: ["#ffc2e0", "#ec4899"],
    draw(c, F, hue) {
      const cols = ["#ff7aa8", "#ffd166", "#b78cff", "#7de0b0"];
      for (let i = 0; i < 9; i += 1) {
        const a = Math.PI + (i / 8) * Math.PI;
        const x = Math.cos(a) * 1.1;
        const y = F.top + 0.35 + Math.sin(a) * 0.55 + 0.25;
        for (let k = 0; k < 5; k += 1) {
          const b = (k / 5) * TAU;
          ell(c, x + Math.cos(b) * 0.1, y + Math.sin(b) * 0.1, 0.08, 0.08, tint(cols[i % 4], hue));
        }
        ell(c, x, y, 0.06, 0.06, "#fff3b0");
      }
    },
  },
};

export const MASK_NONE = "none";
export const MASK_RANDOM = "random";

export const MASK_CATEGORIES = [
  { id: "animals", emoji: "🐾", label: "Animaux" },
  { id: "accessories", emoji: "🎩", label: "Accessoires" },
];

export const MASK_PRESETS = [
  ...Object.entries(ANIMALS).map(([id, a]) => ({ id, cat: "animals", emoji: a.emoji, label: a.label, sw: a.sw })),
  ...Object.entries(ACCESSORIES).map(([id, a]) => ({ id, cat: "accessories", emoji: a.emoji, label: a.label, sw: a.sw })),
];
export const masksByCategory = (cat) => MASK_PRESETS.filter((m) => m.cat === cat);

const ANIMAL_IDS = Object.keys(ANIMALS);
const ACCESSORY_IDS = Object.keys(ACCESSORIES);

// Un entier → un animal + une couleur + (souvent) un accessoire : infini.
export function resolveMask(mask) {
  if (!mask || mask.id === MASK_NONE) return null;
  if (mask.id === MASK_RANDOM) {
    const rng = makeRng((mask.seed || 1) * 2246822519);
    const animal = ANIMAL_IDS[Math.floor(rng() * ANIMAL_IDS.length)];
    const acc = rng() < 0.6 ? ACCESSORY_IDS[Math.floor(rng() * ACCESSORY_IDS.length)] : null;
    return { animal, accessory: acc, hue: Math.round((rng() * 2 - 1) * 150 * (rng() < 0.65 ? 1 : 0.2)), scale: 0.9 + rng() * 0.3 };
  }
  if (ANIMALS[mask.id]) return { animal: mask.id, accessory: null, hue: mask.hue || 0, scale: 1 };
  if (ACCESSORIES[mask.id]) return { animal: null, accessory: mask.id, hue: mask.hue || 0, scale: 1 };
  return null;
}

export const describeMask = (mask) => {
  if (!mask || mask.id === MASK_NONE) return null;
  if (mask.id === MASK_RANDOM) {
    const r = resolveMask(mask);
    return { label: `${ANIMALS[r.animal].label}${r.accessory ? " + " + ACCESSORIES[r.accessory].label.toLowerCase() : ""} #${mask.seed}`, emoji: ANIMALS[r.animal].emoji };
  }
  const p = MASK_PRESETS.find((m) => m.id === mask.id);
  return p ? { label: p.label, emoji: p.emoji } : null;
};

// Dessine le masque. face = analyzeFace(), (w, h) = taille du canvas en pixels.
export function drawMask(ctx, face, mask, w, h) {
  const r = resolveMask(mask);
  if (!r || !face) return;
  const unit = face.unitPx * h;
  const U = face.unit;
  const eyes = face.eyes.map(U);
  // Les yeux doivent rester dans une plage raisonnable pour que le dessin reste joli.
  const F = {
    eyes: eyes.sort((a, b) => a.x - b.x),
    nose: U(face.noseTip),
    mouth0: U(face.mouthC),
    top: U(face.top).y - 0.06,
    blink: face.blink,
    mouth: face.mouthOpen,
  };
  const yaw = face.yaw;
  stretch = Math.min(1.5, Math.max(0.9, face.H / face.W / 1.3));

  ctx.save();
  ctx.translate(face.center.x * h, face.center.y * h);
  ctx.rotate(face.roll);
  ctx.scale(unit * (r.scale || 1), unit * (r.scale || 1));
  if (r.animal) {
    const a = ANIMALS[r.animal];
    const P = {};
    Object.entries(a.pal).forEach(([k, v]) => {
      P[k] = tint(v, r.hue);
    });
    P.line = "#3a1d14";
    // Tête + oreilles ne bougent pas ; les traits du visage glissent avec la rotation de la tête.
    ctx.save();
    ctx.translate(yaw * 0.12, 0);
    a.draw(ctx, F, P);
    ctx.restore();
  }
  if (r.accessory) ACCESSORIES[r.accessory].draw(ctx, { ...F, top: F.top }, r.hue);
  ctx.restore();
}
