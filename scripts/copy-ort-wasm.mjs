#!/usr/bin/env node
/**
 * Copie les fichiers WebAssembly d'ONNX Runtime (utilisés par Whisper dans le
 * navigateur pour « lire les vocaux ») vers public/ort/.
 *
 * Pourquoi : on les sert depuis notre propre domaine plutôt que depuis un CDN,
 * ce qui garde la CSP stricte (script-src 'self') et permet de fonctionner
 * hors connexion une fois l'application chargée.
 *
 * Lancé automatiquement avant `npm run dev` et `npm run build`.
 * Ne bloque jamais le build : s'il manque quelque chose, il avertit seulement.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "onnxruntime-web", "dist");
const dest = join(root, "public", "ort");

if (!existsSync(src)) {
  console.warn(
    "[copy-ort-wasm] onnxruntime-web introuvable : lance `npm install` pour activer la transcription des vocaux."
  );
  process.exit(0);
}

const wanted = readdirSync(src).filter((f) => /^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f));

if (wanted.length === 0) {
  console.warn("[copy-ort-wasm] aucun fichier ort-wasm-simd-threaded* trouvé dans", src);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const f of wanted) copyFileSync(join(src, f), join(dest, f));
console.log(`[copy-ort-wasm] ${wanted.length} fichier(s) copié(s) vers public/ort/`);
