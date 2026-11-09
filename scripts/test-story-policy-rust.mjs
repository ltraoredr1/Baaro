import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rustc = process.env.RUSTC || join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin', `rustc${process.platform === 'win32' ? '.exe' : ''}`);
const tempDir = await mkdtemp(join(tmpdir(), 'baaro-story-policy-'));
const binary = join(tempDir, `story-policy-tests${process.platform === 'win32' ? '.exe' : ''}`);

try {
  const compile = spawnSync(rustc, [
    '--edition=2021', '--test',
    resolve(root, 'src/features/stories/native/story_policy.rs'),
    '-o', binary,
  ], { cwd: root, stdio: 'inherit' });
  if (compile.error || compile.status !== 0) throw new Error('Compilation des tests unitaires Rust Stories impossible.');
  const test = spawnSync(binary, [], { cwd: root, stdio: 'inherit' });
  if (test.error || test.status !== 0) throw new Error('Les tests unitaires Rust Stories ont échoué.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
