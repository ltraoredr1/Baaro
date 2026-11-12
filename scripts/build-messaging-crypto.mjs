import { existsSync } from 'node:fs';
import { mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const crate = join(root, 'src/features/messaging/native');
const pkg = join(crate, 'pkg');
const out = join(root, 'public/wasm');
const generatedJs = join(pkg, 'messaging_crypto.js');
const generatedWasm = join(pkg, 'messaging_crypto_bg.wasm');
const artifacts = [join(out, 'messaging_crypto.js'), join(out, 'messaging_crypto_bg.wasm')];
const strict = process.argv.includes('--strict');
const wasmPack = process.env.WASM_PACK || 'wasm-pack';

function run(bin, args) {
  const result = spawnSync(bin, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} a échoué (status ${result.status ?? 'indisponible'}).`);
  }
}

const onVercel = Boolean(process.env.VERCEL);
if (onVercel && !strict && artifacts.every(existsSync)) {
  console.log('Vercel : artefacts messaging WASM versionnés, compilation ignorée.');
  process.exit(0);
}

const available = spawnSync(wasmPack, ['--version'], { cwd: root, stdio: 'ignore' });
if (available.error || available.status !== 0) {
  if (!strict && artifacts.every(existsSync)) {
    console.warn('wasm-pack absent : utilisation des artefacts messaging WASM versionnés.');
    process.exit(0);
  }
  throw new Error('wasm-pack est requis. Installe-le ou utilise --strict pour rendre ce prérequis explicite.');
}

// Reproductibilité : rustc embarque les chemins absolus des sources
// dans le .wasm. Sans ça, /workspaces/Baaro (Codespace) et
// /home/runner/work/Baaro/Baaro (CI) produisent 2 binaires différents
// pour le même code, et le check `git status` en CI échoue toujours.
const cargoHome =
  process.env.CARGO_HOME ?? join(homedir(), '.cargo');
const remapFlags = [
  `--remap-path-prefix=${root}=/baaro`,
  `--remap-path-prefix=${cargoHome}=/cargo-home`,
].join(' ');
process.env.RUSTFLAGS = [process.env.RUSTFLAGS ?? '', remapFlags]
  .join(' ')
  .trim();

await mkdir(dirname(generatedJs), { recursive: true });
await mkdir(out, { recursive: true });
try {
  run(wasmPack, [
    'build', crate,
    '--target', 'web',
    '--release',
    '--out-dir', pkg,
    '--out-name', 'messaging_crypto',
  ]);
} catch (error) {
  if (!strict && artifacts.every(existsSync)) {
    console.warn(`Build WASM impossible (${error.message}); artefacts versionnés utilisés.`);
    process.exit(0);
  }
  throw error;
}

if (!existsSync(generatedJs) || !existsSync(generatedWasm)) {
  throw new Error('wasm-pack n’a pas produit les deux artefacts messaging attendus.');
}
await Promise.all([
  copyFile(generatedJs, artifacts[0]),
  copyFile(generatedWasm, artifacts[1]),
]);
console.log('Messaging WASM prêt : public/wasm/messaging_crypto.js + messaging_crypto_bg.wasm');
