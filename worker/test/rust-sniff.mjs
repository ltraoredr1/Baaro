// Vérifie le résultat du détecteur Rust sur des signatures de fichiers connues.
// Usage : BAARO_MEDIA_BIN=rust/baaro-media/target/release/baaro-media node test/rust-sniff.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sniffFile } from "../lib/native.mjs";

let checks = 0;
const dir = await mkdtemp(join(tmpdir(), "baaro-sniff-"));
try {
  const cases = [
    ["a.mp4", Buffer.from("\0\0\0\x20ftypisom\0\0\0\0"), { kind: "mp4", media: true, danger: false }],
    ["b.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { kind: "jpg", media: true, danger: false }],
    ["c.mp4", Buffer.from("\x7fELF\x02\x01\x01"), { kind: "elf", media: false, danger: true }],
    ["d.mp4", Buffer.from("<html><script>alert(1)</script>"), { kind: "html", media: false, danger: true }],
    ["e.mp4", Buffer.from("PK\x03\x04rest"), { kind: "zip", media: false, danger: true }],
    ["f.bin", Buffer.from("rien de connu"), { kind: "unknown", media: false, danger: false }],
  ];

  for (const [name, bytes, want] of cases) {
    const path = join(dir, name);
    await writeFile(path, bytes);
    const got = await sniffFile(path);
    assert.ok(got, `sniff ${name} : pas de résultat`);
    assert.equal(got.kind, want.kind, `sniff ${name}`);
    assert.equal(got.media, want.media, `sniff ${name} media`);
    assert.equal(got.danger, want.danger, `sniff ${name} danger`);
    assert.equal(got.size, bytes.length, `sniff ${name} size`);
    checks++;
  }

  assert.equal(await sniffFile(join(dir, "inexistant")), null);
  checks++;
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(`OK : ${checks} vérifications de signatures Rust`);
