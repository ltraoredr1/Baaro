import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "baaro-native-missing-"));
try {
  process.env.BAARO_MEDIA_BIN = join(dir, "binaire-absent");
  const { assertNativeReady, sniffFile } = await import("../lib/native.mjs");
  const input = join(dir, "source.wav");
  await writeFile(input, "RIFF\0\0\0\0WAVE");
  await assert.rejects(assertNativeReady(), /Démarrage refusé/);
  await assert.rejects(sniffFile(input), /Contrôle Rust\/C/);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("OK : l’absence de Rust/C échoue de manière fermée");
