#!/usr/bin/env node
/**
 * Copie les fichiers WebAssembly de MediaPipe (suivi du visage et du corps pour les
 * effets « Visage & corps ») vers public/mediapipe/wasm/.
 *
 * Même logique que copy-ort-wasm.mjs : on sert ces fichiers depuis notre propre domaine
 * pour garder la CSP stricte (script-src 'self'). Ne bloque jamais le build.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-mediapipe-wasm] @mediapipe/tasks-vision introuvable : lance `npm install`.");
  process.exit(0);
}
const files = readdirSync(src).filter((f) => /^vision_wasm.*\.(wasm|js)$/.test(f));
if (!files.length) {
  console.warn("[copy-mediapipe-wasm] aucun fichier vision_wasm* trouvé dans", src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`[copy-mediapipe-wasm] ${files.length} fichier(s) copié(s) vers public/mediapipe/wasm/`);
