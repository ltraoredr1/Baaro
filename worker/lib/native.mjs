import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

/**
 * Détecte le type réel d'un fichier d'après sa signature.
 * En production (ou si BAARO_SNIFF_REQUIRED=1) on refuse de traiter
 * si le binaire Rust est absent ou échoue.
 *
 * Retourne { kind, mime, media, danger, size }
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
    const required =
      process.env.NODE_ENV === "production" ||
      process.env.BAARO_SNIFF_REQUIRED === "1";

    if (required) {
      throw new Error(
        `Contrôle de signature impossible (binaire ${config.mediaBin} indisponible ou en erreur) : ${error?.message || error}`
      );
    }

    // Mode développement uniquement
    console.warn(
      `[worker] binaire Rust \( {config.mediaBin} indisponible ( \){error?.code || error?.message}) : contrôle de signature non effectué`
    );
    return null;
  }
}
