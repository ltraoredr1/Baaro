import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Suivi du visage et du corps (MediaPipe) — 100 % dans le navigateur.
// Les fichiers sont servis depuis NOTRE domaine (CSP stricte) :
//   public/mediapipe/wasm/*        copiés automatiquement (scripts/copy-mediapipe-wasm.mjs)
//   public/models/face_landmarker.task        à déposer à la main (voir public/models/README.md)
//   public/models/pose_landmarker_lite.task   idem, seulement pour les effets « corps »

const base = () => `${import.meta.env.BASE_URL || "./"}`;
const url = (path) => new URL(`${base()}${path}`, document.baseURI).href;

export const MODEL_PATHS = {
  face: "models/face_landmarker.task",
  pose: "models/pose_landmarker_lite.task",
};

const listeners = new Set();
const state = {
  status: { face: "idle", pose: "idle" }, // idle | loading | ready | error
  error: { face: "", pose: "" },
};
let vision = null;
let faceLandmarker = null;
let poseLandmarker = null;
let loading = {};
let lastTs = 0;
const cache = new WeakMap(); // source → { t, result }

const emit = () => listeners.forEach((fn) => fn({ ...state, status: { ...state.status }, error: { ...state.error } }));

export const subscribeTracker = (fn) => {
  listeners.add(fn);
  fn({ ...state, status: { ...state.status }, error: { ...state.error } });
  return () => listeners.delete(fn);
};

async function modelExists(path) {
  try {
    const res = await fetch(url(path), { method: "HEAD" });
    const type = res.headers.get("content-type") || "";
    // Un SPA renvoie index.html (200) quand le fichier manque.
    return res.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

async function create(Klass, kind, path, extra) {
  if (!vision) vision = await FilesetResolver.forVisionTasks(url("mediapipe/wasm"));
  if (!(await modelExists(path))) {
    throw new Error(`Modèle manquant : public/${path}`);
  }
  const make = (delegate) =>
    Klass.createFromOptions(vision, {
      baseOptions: { modelAssetPath: url(path), delegate },
      runningMode: "VIDEO",
      ...extra,
    });
  try {
    return await make("GPU");
  } catch {
    return make("CPU");
  }
}

// Charge les modèles nécessaires (une seule fois). pose = true pour les effets « corps ».
export function ensureTracker({ pose = false } = {}) {
  const jobs = [];
  const run = (kind, factory, assign) => {
    if (state.status[kind] === "ready") return;
    if (!loading[kind]) {
      state.status[kind] = "loading";
      state.error[kind] = "";
      emit();
      loading[kind] = factory()
        .then((lm) => {
          assign(lm);
          state.status[kind] = "ready";
        })
        .catch((error) => {
          console.warn(`BAARO suivi ${kind}:`, error);
          state.status[kind] = "error";
          state.error[kind] = error?.message || "Chargement impossible";
          loading[kind] = null;
        })
        .finally(emit);
    }
    jobs.push(loading[kind]);
  };
  run("face", () => create(FaceLandmarker, "face", MODEL_PATHS.face, { numFaces: 1 }), (lm) => {
    faceLandmarker = lm;
  });
  if (pose) {
    run("pose", () => create(PoseLandmarker, "pose", MODEL_PATHS.pose, { numPoses: 1 }), (lm) => {
      poseLandmarker = lm;
    });
  }
  return Promise.all(jobs);
}

// Détection sur l'image courante de `source` (<video>). Résultat réutilisé si appelé deux
// fois dans la même image (aperçu + enregistrement).
export function detect(source, { pose = false } = {}) {
  const now = performance.now();
  const hit = cache.get(source);
  if (hit && now - hit.t < 12 && (!pose || hit.result.poseTried)) return hit.result;

  const result = { face: null, pose: null, poseTried: pose };
  lastTs = Math.max(lastTs + 1, now);
  try {
    if (faceLandmarker) {
      const r = faceLandmarker.detectForVideo(source, lastTs);
      result.face = r?.faceLandmarks?.[0] || null;
    }
    if (pose && poseLandmarker) {
      lastTs += 1;
      const r = poseLandmarker.detectForVideo(source, lastTs);
      result.pose = r?.landmarks?.[0] || null;
    }
  } catch (error) {
    console.warn("BAARO détection:", error);
  }
  cache.set(source, { t: now, result });
  return result;
}

export const trackerReady = (pose = false) =>
  state.status.face === "ready" && (!pose || state.status.pose === "ready");
