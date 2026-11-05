import { analyzeBody, analyzeFace, smoothLandmarks } from "./geometry.js";
import { drawMask } from "./masks.js";
import { buildScene } from "./operators.js";
import { detect, ensureTracker, trackerReady } from "./tracker.js";
import { WarpRenderer } from "./warpRenderer.js";

const HOLD_FRAMES = 8; // on garde le dernier visage quelques images si la détection saute

// Applique les déformations à une image vidéo. process() renvoie { source, w, h } :
// la source d'origine si rien à faire (ou suivi pas prêt), sinon le canvas déformé.
export class FaceFxProcessor {
  constructor() {
    this.renderer = null;
    this.comp = null;
    this.failed = false;
    this.face = null;
    this.body = null;
    this.lostFace = 0;
    this.lostBody = 0;
  }

  process(source, sw, sh, resolved, { maxSide = 1280 } = {}) {
    const passthrough = { source, w: sw, h: sh };
    if (this.failed || !resolved?.active || !sw || !sh) return passthrough;
    const wantPose = resolved.needsPose;
    ensureTracker({ pose: wantPose });
    if (!trackerReady(false)) return passthrough;

    if (!this.renderer) {
      try {
        this.renderer = new WarpRenderer();
      } catch (error) {
        console.warn("BAARO déformation indisponible:", error);
        this.failed = true;
        return passthrough;
      }
    }

    const aspect = sw / sh;
    const found = detect(source, { pose: wantPose && trackerReady(true) });
    if (found.face) {
      this.face = smoothLandmarks(this.face, found.face);
      this.lostFace = 0;
    } else if (++this.lostFace > HOLD_FRAMES) this.face = null;
    if (found.pose) {
      this.body = smoothLandmarks(this.body, found.pose);
      this.lostBody = 0;
    } else if (++this.lostBody > HOLD_FRAMES) this.body = null;

    const face = analyzeFace(this.face, aspect);
    const body = wantPose ? analyzeBody(this.body, aspect) : null;
    if (!face && !body) return passthrough;

    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(2, Math.round(sw * scale));
    const h = Math.max(2, Math.round(sh * scale));
    let out = { source, w: sw, h: sh };
    if (resolved.hasWarp) {
      const scene = buildScene(resolved, face, body);
      this.renderer.render(source, sw, sh, w, h, scene);
      out = { source: this.renderer.canvas, w, h };
    }
    if (resolved.mask && face) {
      if (!this.comp) this.comp = document.createElement("canvas");
      if (this.comp.width !== w || this.comp.height !== h) {
        this.comp.width = w;
        this.comp.height = h;
      }
      const ctx = this.comp.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(out.source, 0, 0, w, h);
      drawMask(ctx, face, resolved.mask, w, h);
      out = { source: this.comp, w, h };
    }
    if (out.source === source) return passthrough;
    return out;
  }

  dispose() {
    this.renderer?.dispose();
    this.renderer = null;
    this.comp = null;
  }
}
