import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);
let warned = false;

function warnOnce(error) {
  if (warned) return;
  warned = true;
  console.warn(
    `[worker] binaire Rust ${config.mediaBin} indisponible (${error?.code || error?.message}) : contrôle de signature non effectué`
  );
}

/**
 * Détecte le type réel d'un fichier d'après sa signature.
 * Retourne { kind, mime, media, danger, size } ou null si le binaire est absent
 * ou échoue.
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
    if (typeof error?.code !== "number") warnOnce(error);
    return null;
  }
}
