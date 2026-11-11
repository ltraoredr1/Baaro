import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rustc = process.env.RUSTC || join(
  process.env.CARGO_HOME || join(homedir(), '.cargo'),
  'bin',
  `rustc${process.platform === 'win32' ? '.exe' : ''}`,
);
const source = resolve(root, 'src/features/offline/native/offline_core.rs');
const tempDir = await mkdtemp(join(tmpdir(), 'baaro-offline-core-'));
const binary = join(tempDir, `offline-core-tests${process.platform === 'win32' ? '.exe' : ''}`);

try {
  const compile = spawnSync(rustc, [
    '--edition=2021',
    '--test',
    source,
    '-o',
    binary,
  ], { cwd: root, stdio: 'inherit' });
  if (compile.error || compile.status !== 0) {
    throw new Error('Compilation des tests unitaires Rust offline impossible.');
  }

  const test = spawnSync(binary, [], { cwd: root, stdio: 'inherit' });
  if (test.error || test.status !== 0) {
    throw new Error('Les tests unitaires Rust offline ont échoué.');
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
