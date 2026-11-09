import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'public', 'wasm');
const rustc = process.env.RUSTC || join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin', 'rustc');
const clang = process.env.CLANG || 'clang';
const strict = process.argv.includes('--strict');
const artifacts = [join(out, 'stories_policy.wasm'), join(out, 'stories_media.wasm')];

function run(bin, args) {
  const result = spawnSync(bin, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} a échoué (status ${result.status ?? 'indisponible'}).`);
  }
}

// --- CORRECTION 1 : Sur Vercel, on ne compile JAMAIS si les fichiers sont déjà là ---
// Vercel n'a pas clang / rustc / wasm-ld, donc inutile d'essayer.
// On utilise directement les .wasm commités.
if (process.env.VERCEL && artifacts.every(existsSync)) {
  console.log('Vercel : WASM déjà présents, compilation ignorée.');
  console.log('Stories WASM prêt : public/wasm/stories_policy.wasm + stories_media.wasm');
  process.exit(0);
}

await mkdir(out, { recursive: true });

// --- CORRECTION 2 : On compile chaque fichier séparément ---
// Si Rust échoue mais que stories_policy.wasm existe déjà, on ne plante pas pour ça.
// Pareil pour le C. Avant, un seul échec faisait planter les 2.
async function buildOne(index, buildFn, label) {
  // Si le fichier existe déjà et qu'on n'est pas en --strict, on peut sauter
  // la compilation si on est sur une CI sans toolchain.
  // En local, on essaie toujours de recompiler pour avoir la dernière version.
  try {
    buildFn();
    console.log(`✅ ${label} compilé`);
  } catch (error) {
    if (strict) {
      console.error('Build Rust/C WASM impossible en mode --strict.');
      throw error;
    }
    if (existsSync(artifacts[index])) {
      console.warn(`⚠️ Échec compilation ${label}, utilisation de l'artefact versionné : ${error.message}`);
      return; // On continue, on ne plante pas
    }
    console.error('Build Rust/C WASM impossible. Installe Rust + cible wasm32-unknown-unknown, clang et lld.');
    throw error;
  }
}

await buildOne(0, () => {
  run(rustc, [
    '--edition=2021', '--target=wasm32-unknown-unknown', '--crate-type=cdylib',
    '-C', 'opt-level=z', '-C', 'panic=abort',
    resolve(root, 'src/features/stories/native/story_policy.rs'),
    '-o', artifacts[0],
  ]);
}, 'stories_policy.wasm');

await buildOne(1, () => {
  run(clang, [
    '--target=wasm32-unknown-unknown', '-std=c11', '-Oz', '-nostdlib',
    '-Wl,--no-entry', '-Wl,--export=story_input_buffer',
    '-Wl,--export=story_detect_media', '-Wl,--export-memory',
    resolve(root, 'src/features/stories/native/media_sniff.c'),
    '-o', artifacts[1],
  ]);
}, 'stories_media.wasm');

console.log('Stories WASM prêt : public/wasm/stories_policy.wasm + stories_media.wasm');
