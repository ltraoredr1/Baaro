import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

export async function assertNativeReady() {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(config.mediaBin, ["--version"], { timeout: 5_000 }));
  } catch (cause) {
    throw new Error("Démarrage refusé : binaire Rust/C indisponible", { cause });
  }
  const version = stdout.trim();
  if (!/^baaro-media \S+ \(libavformat \d+\.\d+\.\d+\)$/.test(version)) {
    throw new Error("Démarrage refusé : le binaire Rust/C n’est pas lié à libavformat");
  }
  return version;
}

/**
 * Détecte la signature puis valide le conteneur avec le binaire Rust/C.
 * Toute absence, erreur ou réponse mal formée est une erreur bloquante.
 */
export async function sniffFile(path) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      config.mediaBin,
      ["sniff", path],
      { timeout: 10_000, maxBuffer: 64 * 1024 }
    ));
  } catch (cause) {
    const error = new Error("Contrôle Rust/C du fichier impossible", { cause });
    error.code = "BAARO_NATIVE_UNAVAILABLE";
    throw error;
  }

  let result;
  try {
    result = JSON.parse(stdout);
  } catch (cause) {
    throw new Error("Réponse JSON invalide du contrôle Rust/C", { cause });
  }

  if (
    !result ||
    typeof result.kind !== "string" ||
    typeof result.media !== "boolean" ||
    typeof result.danger !== "boolean" ||
    typeof result.containerValid !== "boolean"
  ) {
    throw new Error("Réponse incomplète du contrôle Rust/C");
  }
  return result;
}
