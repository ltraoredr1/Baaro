import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

let warned = false;

function warnOnce(error) {
  if (warned) return;
  warned = true;
  console.warn(
    `[worker] binaire Rust ${config.mediaBin} indisponible (${error?.code || error?.message}) : repli sur le code JS`
  );
}

/**
 * Type réel d'un fichier d'après sa signature (binaire Rust baaro-media).
 * Retourne { kind, mime, media, danger, size } ou null si le binaire est absent
 * ou échoue : la validation est alors simplement ignorée.
 */
export async function sniffFile(path) {
  try {
    const { stdout } = await execFileAsync(
      config.mediaBin,
      ["sniff", path],
      { timeout: 10_000, maxBuffer: 64 * 1024 }
    );
    return JSON.parse(stdout);
  } catch (error) {
    // Code numérique = le binaire a tourné mais n'a pas pu lire le fichier ;
    // code texte (ENOENT, EACCES…) = binaire introuvable ou inexécutable.
    if (typeof error?.code !== "number") warnOnce(error);
    return null;
  }
}

/**
 * Découpe un WebVTT avec le binaire Rust.
 * Retourne le tableau de blocs, ou null (binaire absent, entrée invalide, erreur) :
 * l'appelant retombe alors sur l'implémentation JS, qui produit les mêmes erreurs.
 */
export function parseVttNative(vtt) {
  const result = spawnSync(config.mediaBin, ["vtt-parse"], {
    input: String(vtt ?? ""),
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    warnOnce(result.error);
    return null;
  }
  if (result.status !== 0) return null;

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}
