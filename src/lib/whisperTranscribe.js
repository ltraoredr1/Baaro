/**
 * src/lib/whisperTranscribe.js
 *
 * Transcription des vocaux en texte, directement sur l'appareil (Whisper via
 * transformers.js / ONNX Runtime Web). Aucun audio n'est envoyé à un serveur.
 *
 * - Le modèle est téléchargé UNE fois (cache du navigateur), puis tout marche
 *   hors connexion.
 * - Français : Whisper multilingue (par défaut "Xenova/whisper-base").
 * - Bambara : Whisper d'origine ne connaît PAS le bambara. Il faut un modèle
 *   Whisper ajusté au bambara, converti en ONNX, indiqué par
 *   VITE_WHISPER_BAMBARA_MODEL. Tant qu'il n'est pas configuré, l'option
 *   bambara n'est pas proposée aux utilisateurs.
 *
 * Variables d'environnement (publiques, préfixe VITE_) :
 *   VITE_WHISPER_FR_MODEL        modèle français   (défaut Xenova/whisper-base)
 *   VITE_WHISPER_BAMBARA_MODEL   modèle bambara    (vide = option masquée)
 *   VITE_WHISPER_BAMBARA_LANG    jeton de langue à forcer pour le modèle bambara
 *                                (vide = aucun ; dépend de l'entraînement du modèle)
 */

const FR_MODEL = import.meta.env.VITE_WHISPER_FR_MODEL || "Xenova/whisper-base";
const BM_MODEL = (import.meta.env.VITE_WHISPER_BAMBARA_MODEL || "").trim();
const BM_LANG = (import.meta.env.VITE_WHISPER_BAMBARA_LANG || "").trim();

export const TRANSCRIBE_LANGS = [
  { code: "fr", label: "Français", model: FR_MODEL, whisperLang: "french", approxMb: 80 },
  ...(BM_MODEL
    ? [{ code: "bm", label: "Bambara", model: BM_MODEL, whisperLang: BM_LANG || null, approxMb: 150 }]
    : []),
];

export function isTranscribeLangAvailable(code) {
  return TRANSCRIBE_LANGS.some((l) => l.code === code);
}

const LS_PREFIX = "baaro:vt:";
const LS_READY_PREFIX = "baaro:whisper-ready:";
const LS_LANG_KEY = "baaro:vt-lang";
const MAX_CACHED = 200;

/* ------------------------------------------------------------------ */
/* Cache local des transcriptions (par vocal + langue)                  */
/* ------------------------------------------------------------------ */

function cacheKey(src, lang) {
  // On ignore les paramètres d'URL (signatures temporaires) pour retrouver le même vocal.
  let clean = String(src || "");
  try {
    const u = new URL(clean, typeof window !== "undefined" ? window.location.href : undefined);
    clean = `${u.origin}${u.pathname}`;
  } catch {
    clean = clean.split("?")[0];
  }
  return `${LS_PREFIX}${lang}:${clean}`;
}

export function getCachedTranscript(src, lang) {
  try {
    const raw = localStorage.getItem(cacheKey(src, lang));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj?.text === "string" ? obj.text : null;
  } catch {
    return null;
  }
}

function pruneCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    if (keys.length <= MAX_CACHED) return;
    const withTs = keys.map((k) => {
      let ts = 0;
      try {
        ts = JSON.parse(localStorage.getItem(k))?.ts || 0;
      } catch {
        /* ignore */
      }
      return { k, ts };
    });
    withTs.sort((a, b) => a.ts - b.ts);
    withTs.slice(0, keys.length - MAX_CACHED).forEach(({ k }) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function setCachedTranscript(src, lang, text) {
  try {
    localStorage.setItem(cacheKey(src, lang), JSON.stringify({ text, ts: Date.now() }));
    pruneCache();
  } catch {
    /* stockage plein ou indisponible : sans importance */
  }
}

export function isModelReady(lang) {
  try {
    return localStorage.getItem(`${LS_READY_PREFIX}${lang}`) === "1";
  } catch {
    return false;
  }
}

function markModelReady(lang) {
  try {
    localStorage.setItem(`${LS_READY_PREFIX}${lang}`, "1");
  } catch {
    /* ignore */
  }
}

export function getPreferredLang() {
  try {
    const v = localStorage.getItem(LS_LANG_KEY);
    if (v && isTranscribeLangAvailable(v)) return v;
  } catch {
    /* ignore */
  }
  return "fr";
}

export function setPreferredLang(code) {
  try {
    localStorage.setItem(LS_LANG_KEY, code);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Décodage audio → Float32 mono 16 kHz (format attendu par Whisper)    */
/* ------------------------------------------------------------------ */

const TARGET_SR = 16000;

async function fetchAudioBlob(src) {
  let res;
  try {
    res = await fetch(src, { mode: "cors" });
  } catch {
    throw new Error(
      "Impossible de récupérer le vocal pour le lire (connexion ou autorisation CORS du stockage)."
    );
  }
  if (!res.ok) throw new Error(`Vocal indisponible (erreur ${res.status}).`);
  return res.blob();
}

async function decodeTo16kMono(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || !OAC) throw new Error("Ce navigateur ne sait pas décoder l'audio.");

  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AC();
  let decoded;
  try {
    // Copie : certains navigateurs « détachent » le buffer après décodage.
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error("Format audio non pris en charge par cet appareil.");
  } finally {
    ctx.close?.().catch?.(() => {});
  }

  if (decoded.sampleRate === TARGET_SR && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0).slice();
  }

  // Rééchantillonnage + mixage mono via un contexte hors-ligne.
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SR));
  const offline = new OAC(1, length, TARGET_SR);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/* ------------------------------------------------------------------ */
/* Chargement de Whisper (une instance par langue, mise en cache)       */
/* ------------------------------------------------------------------ */

let transformersPromise = null;
const pipelines = new Map(); // code langue -> Promise<pipeline>
let queue = Promise.resolve(); // une seule transcription à la fois

async function loadTransformers() {
  if (!transformersPromise) {
    transformersPromise = import("@huggingface/transformers").then((mod) => {
      const { env } = mod;
      env.allowLocalModels = false; // modèles téléchargés depuis le Hub puis gardés en cache
      env.useBrowserCache = true; // Cache API : fonctionne ensuite hors connexion
      const wasm = env.backends?.onnx?.wasm;
      if (wasm) {
        // Fichiers WASM servis par BAARO (copiés dans public/ort par scripts/copy-ort-wasm.mjs).
        const base = new URL(`${import.meta.env.BASE_URL || "./"}ort/`, document.baseURI).href;
        wasm.wasmPaths = base;
        wasm.numThreads = 1; // pas d'isolation cross-origin : un seul fil, plus compatible
        wasm.proxy = false;
      }
      return mod;
    });
    transformersPromise.catch(() => {
      transformersPromise = null;
    });
  }
  return transformersPromise;
}

function createProgressReporter(onProgress) {
  const files = new Map();
  return (p) => {
    if (!onProgress || !p) return;
    if (p.status === "progress" && p.file && Number.isFinite(p.loaded) && Number.isFinite(p.total)) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      files.forEach((f) => {
        loaded += f.loaded;
        total += f.total;
      });
      if (total > 0) onProgress({ stage: "model", percent: Math.min(99, Math.round((loaded / total) * 100)) });
    } else if (p.status === "initiate" || p.status === "download") {
      onProgress({ stage: "model", percent: null });
    }
  };
}

async function getPipeline(langCfg, onProgress) {
  if (!pipelines.has(langCfg.code)) {
    const promise = (async () => {
      const { pipeline } = await loadTransformers();
      const progress_callback = createProgressReporter(onProgress);

      const build = (device, dtype) =>
        pipeline("automatic-speech-recognition", langCfg.model, { device, dtype, progress_callback });

      // Carte graphique (WebGPU) si possible, sinon processeur (WASM) : plus lent mais universel.
      if (typeof navigator !== "undefined" && navigator.gpu) {
        try {
          return await build("webgpu", { encoder_model: "fp32", decoder_model_merged: "q4" });
        } catch {
          /* repli sur WASM */
        }
      }
      return build("wasm", "q8");
    })();
    pipelines.set(langCfg.code, promise);
    promise.catch(() => pipelines.delete(langCfg.code));
  }
  return pipelines.get(langCfg.code);
}

/* ------------------------------------------------------------------ */
/* API principale                                                       */
/* ------------------------------------------------------------------ */

/**
 * Transcrit un vocal.
 * @param {string} src        URL du vocal (media_url)
 * @param {"fr"|"bm"} lang    langue du vocal
 * @param {{ onProgress?: (p:{stage:"model"|"decode"|"transcribe", percent:number|null}) => void,
 *           force?: boolean }} [opts]
 * @returns {Promise<string>} texte
 */
export function transcribeVoice(src, lang = "fr", opts = {}) {
  const { onProgress, force = false } = opts;

  const langCfg = TRANSCRIBE_LANGS.find((l) => l.code === lang);
  if (!langCfg) return Promise.reject(new Error("Langue non disponible."));

  if (!force) {
    const cached = getCachedTranscript(src, lang);
    if (cached != null) return Promise.resolve(cached);
  }

  const run = async () => {
    onProgress?.({ stage: "decode", percent: null });
    const blob = await fetchAudioBlob(src);
    const audio = await decodeTo16kMono(blob);
    if (!audio.length || audio.length < TARGET_SR * 0.3) return "";

    const asr = await getPipeline(langCfg, onProgress);
    markModelReady(lang);

    onProgress?.({ stage: "transcribe", percent: null });
    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      return_timestamps: false,
    };
    if (langCfg.whisperLang) options.language = langCfg.whisperLang;

    const out = await asr(audio, options);
    const text = String(Array.isArray(out) ? out.map((o) => o.text).join(" ") : out?.text || "").trim();
    setCachedTranscript(src, lang, text);
    return text;
  };

  // File d'attente : le modèle ne traite qu'un vocal à la fois.
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
