// Rendu WebGL des déformations (visage / corps) et de l'effet peau (vieux / jeune).
//
// Principe : une liste d'« opérateurs » locaux déplace les pixels autour de points
// (bulge = gonfler/rétrécir, shift = pousser, aniso = étirer par axe). Tout est calculé
// dans le shader, sur le GPU, donc assez rapide pour la caméra en direct.

export const MAX_OPS = 32;

const VERT = `
attribute vec2 a;
varying vec2 v;
void main() {
  v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 v;
uniform sampler2D tex;
uniform float aspect;
uniform vec4 opA[${MAX_OPS}];
uniform vec4 opB[${MAX_OPS}];
uniform int nOps;
uniform float hasFace;
uniform vec4 face;      // cx, cy, rx, ry (espace « aspect »)
uniform float faceRot;
uniform vec4 hair;      // cx, cy, rx, ry
uniform vec2 eyeL;
uniform vec2 eyeR;
uniform vec2 noseL;
uniform vec2 noseR;
uniform vec2 mouthL;
uniform vec2 mouthR;
uniform float age;      // -1 (jeune) .. 1 (vieux)
uniform float smoothAmt;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.1) + 0.0625 * noise(p * 8.3);
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
vec3 sampleAt(vec2 q) {
  return texture2D(tex, clamp(vec2(q.x / aspect, q.y), 0.001, 0.999)).rgb;
}

void main() {
  vec2 p = vec2(v.x * aspect, v.y);
  vec2 q = p;
  for (int i = 0; i < ${MAX_OPS}; i++) {
    if (i >= nOps) break;
    vec4 A = opA[i];
    vec4 B = opB[i];
    vec2 d = p - A.xy;
    float f = 1.0 - smoothstep(0.0, A.z, length(d));
    if (A.w < 0.5) q -= d * B.x * f;
    else if (A.w < 1.5) q -= B.xy * f;
    else q -= d * B.xy * f;
  }

  vec3 c = sampleAt(q);

  if (hasFace > 0.5) {
    float cs = cos(faceRot);
    float sn = sin(faceRot);
    vec2 dp = q - face.xy;
    vec2 r = vec2(cs * dp.x + sn * dp.y, -sn * dp.x + cs * dp.y);
    vec2 qn = r / face.zw;
    float m = 1.0 - smoothstep(0.7, 1.0, length(qn));
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    float scale = face.z;

    // Jeune : lissage de la peau qui préserve les contours (yeux, bouche).
    float young = max(-age, 0.0);
    float sm = clamp(smoothAmt + young * 0.8, 0.0, 1.0) * m;
    if (sm > 0.01) {
      float rad = face.w * 0.018;
      vec3 acc = c;
      float ws = 1.0;
      for (int k = 0; k < 8; k++) {
        float an = float(k) * 0.785398;
        vec2 o1 = vec2(cos(an), sin(an)) * rad;
        vec2 o2 = o1 * 2.2;
        vec3 s1 = sampleAt(q + o1);
        vec3 s2 = sampleAt(q + o2);
        float w1 = exp(-pow(dot(s1, vec3(0.299, 0.587, 0.114)) - luma, 2.0) * 60.0);
        float w2 = exp(-pow(dot(s2, vec3(0.299, 0.587, 0.114)) - luma, 2.0) * 60.0) * 0.7;
        acc += s1 * w1 + s2 * w2;
        ws += w1 + w2;
      }
      c = mix(c, acc / ws, sm * 0.9);
    }
    if (young > 0.0) {
      c += vec3(0.05, 0.02, 0.015) * young * m;
      float cheek = smoothstep(0.55, 0.0, length(qn - vec2(0.55, 0.15))) + smoothstep(0.55, 0.0, length(qn - vec2(-0.55, 0.15)));
      c = mix(c, c * vec3(1.06, 0.95, 0.95), cheek * young * 0.5);
    }

    // Vieux : rides, cernes, sillons, teint terne, cheveux gris.
    float old = max(age, 0.0);
    if (old > 0.0) {
      float n = fbm(qn * 7.0);
      float lines = 0.0;
      // front
      float fz = smoothstep(-0.95, -0.7, qn.y) * (1.0 - smoothstep(-0.5, -0.35, qn.y)) * (1.0 - smoothstep(0.45, 0.65, abs(qn.x)));
      lines += fz * pow(abs(sin(qn.y * 38.0 + n * 3.0)), 6.0);
      // pattes d'oie
      vec2 dl = q - eyeL;
      vec2 dr = q - eyeR;
      float ce = smoothstep(scale * 0.5, scale * 0.1, length(dl)) + smoothstep(scale * 0.5, scale * 0.1, length(dr));
      lines += ce * pow(abs(sin(atan(dl.y, dl.x) * 9.0 + n * 2.0)), 5.0) * 0.8;
      // sillons nasogéniens
      float nl = min(segDist(q, noseL, mouthL), segDist(q, noseR, mouthR));
      lines += smoothstep(scale * 0.055, 0.0, nl) * 1.1;
      // cernes
      float bag = smoothstep(scale * 0.28, 0.0, length(dl - vec2(0.0, scale * 0.16))) + smoothstep(scale * 0.28, 0.0, length(dr - vec2(0.0, scale * 0.16)));
      c *= 1.0 - bag * old * 0.16;
      c *= 1.0 - clamp(lines, 0.0, 1.0) * m * old * 0.38;
      c *= 1.0 - (n - 0.4) * m * old * 0.22;
      float g = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(g) * vec3(1.04, 1.0, 0.9), old * m * 0.3);

      // cheveux gris : zone au-dessus du front, pixels sombres seulement
      vec2 hd = (p - hair.xy) / hair.zw;
      float mh = (1.0 - smoothstep(0.75, 1.0, length(hd))) * step(p.y, face.y - face.w * 0.25);
      float dark = 1.0 - smoothstep(0.3, 0.62, luma);
      vec3 grey = vec3(0.72 + 0.12 * noise(q * 90.0));
      c = mix(c, mix(c, grey, 0.85), mh * dark * old);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class WarpRenderer {
  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL indisponible");
    this.gl = gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`Shader : ${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Programme : ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.u = {};
    [
      "tex", "aspect", "opA", "opB", "nOps", "hasFace", "face", "faceRot", "hair",
      "eyeL", "eyeR", "noseL", "noseR", "mouthL", "mouthR", "age", "smoothAmt",
    ].forEach((name) => {
      this.u[name] = gl.getUniformLocation(prog, name);
    });
    this.opA = new Float32Array(MAX_OPS * 4);
    this.opB = new Float32Array(MAX_OPS * 4);
  }

  // scene : { ops, face (ou null), age, smooth } — coordonnées en espace « aspect » (x * w/h, y).
  render(source, sw, sh, outW, outH, scene) {
    const gl = this.gl;
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }
    gl.viewport(0, 0, outW, outH);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const ops = scene.ops || [];
    const n = Math.min(ops.length, MAX_OPS);
    this.opA.fill(0);
    this.opB.fill(0);
    for (let i = 0; i < n; i += 1) {
      const o = ops[i];
      this.opA.set([o.x, o.y, Math.max(o.r, 1e-4), o.type], i * 4);
      this.opB.set([o.a || 0, o.b || 0, 0, 0], i * 4);
    }
    const u = this.u;
    gl.uniform1i(u.tex, 0);
    gl.uniform1f(u.aspect, sw / sh);
    gl.uniform4fv(u.opA, this.opA);
    gl.uniform4fv(u.opB, this.opB);
    gl.uniform1i(u.nOps, n);
    const f = scene.face;
    gl.uniform1f(u.hasFace, f ? 1 : 0);
    if (f) {
      gl.uniform4f(u.face, f.cx, f.cy, f.rx, f.ry);
      gl.uniform1f(u.faceRot, f.rot);
      gl.uniform4f(u.hair, f.hair.cx, f.hair.cy, f.hair.rx, f.hair.ry);
      gl.uniform2f(u.eyeL, f.eyeL.x, f.eyeL.y);
      gl.uniform2f(u.eyeR, f.eyeR.x, f.eyeR.y);
      gl.uniform2f(u.noseL, f.noseL.x, f.noseL.y);
      gl.uniform2f(u.noseR, f.noseR.x, f.noseR.y);
      gl.uniform2f(u.mouthL, f.mouthL.x, f.mouthL.y);
      gl.uniform2f(u.mouthR, f.mouthR.x, f.mouthR.y);
    }
    gl.uniform1f(u.age, scene.age || 0);
    gl.uniform1f(u.smoothAmt, scene.smooth || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  dispose() {
    try {
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // rien à libérer
    }
  }
}
