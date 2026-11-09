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

await mkdir(out, { recursive: true });
try {
  run(rustc, [
    '--edition=2021', '--target=wasm32-unknown-unknown', '--crate-type=cdylib',
    '-C', 'opt-level=z', '-C', 'panic=abort',
    resolve(root, 'src/features/stories/native/story_policy.rs'),
    '-o', artifacts[0],
  ]);
  run(clang, [
    '--target=wasm32-unknown-unknown', '-std=c11', '-Oz', '-nostdlib',
    '-Wl,--no-entry', '-Wl,--export=story_input_buffer',
    '-Wl,--export=story_detect_media', '-Wl,--export-memory',
    resolve(root, 'src/features/stories/native/media_sniff.c'),
    '-o', artifacts[1],
  ]);
} catch (error) {
  if (strict || !artifacts.every(existsSync)) {
    console.error('Build Rust/C WASM impossible. Installe Rust + cible wasm32-unknown-unknown, clang et lld.');
    throw error;
  }
  console.warn(`Toolchain WASM absente/incomplète; utilisation des artefacts versionnés: ${error.message}`);
}
console.log('Stories WASM prêt : public/wasm/stories_policy.wasm + stories_media.wasm');
