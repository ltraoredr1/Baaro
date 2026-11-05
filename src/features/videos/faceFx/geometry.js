// Points-clés du visage (maillage MediaPipe, 468/478 points) et du corps (33 points)
// convertis en « espace aspect » : x * (largeur/hauteur), y inchangé.

const avg = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const norm = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

export function analyzeFace(lm, aspect) {
  if (!lm || lm.length < 400) return null;
  const P = (i) => ({ x: lm[i].x * aspect, y: lm[i].y });
  const top = P(10);
  const chin = P(152);
  const sideA = P(234);
  const sideB = P(454);
  const W = dist(sideA, sideB);
  const H = dist(top, chin);
  if (!(W > 0.02) || !(H > 0.02)) return null;
  const right = norm(sub(sideB, sideA)); // axe « droite » du visage
  const up = norm(sub(top, chin)); // axe « haut » du visage
  const center = {
    x: (top.x + chin.x + sideA.x + sideB.x) / 4,
    y: (top.y + chin.y + sideA.y + sideB.y) / 4,
  };
  const eyeA = avg(P(33), P(133));
  const eyeB = avg(P(263), P(362));
  const browMid = avg(P(105), P(334));
  const rot = Math.atan2(right.y, right.x);
  const half = W / 2;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  // Repère « unité » du masque : 1 = demi-largeur du visage, x vers la droite du visage, y vers le bas.
  const unit = (p) => ({
    x: ((p.x - center.x) * right.x + (p.y - center.y) * right.y) / half,
    y: -((p.x - center.x) * up.x + (p.y - center.y) * up.y) / half,
  });
  const lid = (u, l, a, b) => dist(P(u), P(l)) / Math.max(dist(P(a), P(b)), 1e-6);
  const eyeRatio = (lid(159, 145, 33, 133) + lid(386, 374, 263, 362)) / 2;
  const mouthGap = dist(P(13), P(14)) / W;
  const noseU = unit(P(1));
  return {
    unit,
    blink: clamp01((0.2 - eyeRatio) / 0.1),
    mouthOpen: clamp01((mouthGap - 0.03) / 0.25),
    yaw: Math.min(1, Math.max(-1, noseU.x)),
    roll: Math.atan2(up.x, -up.y),
    unitPx: half,
    W,
    H,
    right,
    up,
    center,
    top,
    chin,
    sideA,
    sideB,
    eyes: [eyeA, eyeB],
    brows: [P(105), P(334)],
    browMid,
    forehead: avg(top, browMid),
    noseTip: P(1),
    nostrils: [P(129), P(358)],
    mouthC: avg(P(13), P(14)),
    mouthCorners: [P(61), P(291)],
    jaw: [P(172), P(397)],
    cheeks: [P(50), P(280)],
    shader: {
      cx: center.x,
      cy: center.y,
      rx: (W / 2) * 1.08,
      ry: (H / 2) * 1.08,
      rot,
      hair: { cx: top.x + up.x * H * 0.18, cy: top.y + up.y * H * 0.18, rx: W * 0.95, ry: H * 0.62 },
      eyeL: eyeA,
      eyeR: eyeB,
      noseL: P(129),
      noseR: P(358),
      mouthL: P(61),
      mouthR: P(291),
    },
  };
}

export function analyzeBody(lm, aspect) {
  if (!lm || lm.length < 29) return null;
  const P = (i) => ({ x: lm[i].x * aspect, y: lm[i].y, v: lm[i].visibility ?? 1 });
  const sh = [P(11), P(12)];
  const hip = [P(23), P(24)];
  if (sh.some((p) => p.v < 0.4) || dist(sh[0], sh[1]) < 0.03) return null;
  const shMid = avg(sh[0], sh[1]);
  const torsoLen = hip.every((p) => p.v > 0.3) ? dist(shMid, avg(hip[0], hip[1])) : dist(sh[0], sh[1]) * 1.3;
  const hipMid = hip.every((p) => p.v > 0.3) ? avg(hip[0], hip[1]) : { x: shMid.x, y: shMid.y + torsoLen };
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const shoulderW = dist(sh[0], sh[1]);
  const hipPts = hip.every((p) => p.v > 0.3) ? hip : [
    { x: hipMid.x - shoulderW * 0.35, y: hipMid.y },
    { x: hipMid.x + shoulderW * 0.35, y: hipMid.y },
  ];
  const knees = [P(25), P(26)];
  const ankles = [P(27), P(28)];
  const hasLegs = knees.every((p) => p.v > 0.4) && ankles.every((p) => p.v > 0.3);
  return {
    shoulders: sh,
    shMid,
    hips: hipPts,
    hipMid,
    shoulderW,
    torsoLen,
    waist: [lerp(sh[0], hipPts[0], 0.62), lerp(sh[1], hipPts[1], 0.62)],
    belly: lerp(shMid, hipMid, 0.7),
    elbows: [P(13), P(14)].map((p) => (p.v > 0.4 ? p : null)),
    head: { x: P(0).x, y: P(0).y - torsoLen * 0.08, r: torsoLen * 0.42 },
    knees: hasLegs ? knees : null,
    ankles: hasLegs ? ankles : null,
  };
}

// Lissage exponentiel des points entre deux images (évite le tremblement).
export function smoothLandmarks(prev, next, alpha = 0.55) {
  if (!next) return null;
  if (!prev || prev.length !== next.length) return next.map((p) => ({ ...p }));
  return next.map((p, i) => ({
    x: prev[i].x + (p.x - prev[i].x) * alpha,
    y: prev[i].y + (p.y - prev[i].y) * alpha,
    z: p.z,
    visibility: p.visibility,
  }));
}
