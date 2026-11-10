// Vérifie les signatures Rust et la validation structurelle C/libavformat.
// Usage : BAARO_MEDIA_BIN=rust/baaro-media/target/release/baaro-media node test/rust-sniff.mjs
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sniffFile } from "../lib/native.mjs";

const execFile = promisify(execFileCallback);
let checks = 0;
const dir = await mkdtemp(join(tmpdir(), "baaro-sniff-"));
try {
  const cases = [
    ["a.mp4", Buffer.from("\0\0\0\x20ftypisom\0\0\0\0"), { kind: "mp4", media: true, danger: false, containerValid: false }],
    ["b.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { kind: "jpg", media: true, danger: false, containerValid: false }],
    ["c.mp4", Buffer.from("\x7fELF\x02\x01\x01"), { kind: "elf", media: false, danger: true, containerValid: false }],
    ["d.mp4", Buffer.from("<html><script>alert(1)</script>"), { kind: "html", media: false, danger: true, containerValid: false }],
    ["e.mp4", Buffer.from("PK\x03\x04rest"), { kind: "zip", media: false, danger: true, containerValid: false }],
    ["f.bin", Buffer.from("rien de connu"), { kind: "unknown", media: false, danger: false, containerValid: false }],
  ];

  for (const [name, bytes, want] of cases) {
    const path = join(dir, name);
    await writeFile(path, bytes);
    const got = await sniffFile(path);
    assert.ok(got, `sniff ${name} : pas de résultat`);
    for (const key of ["kind", "media", "danger", "containerValid"]) {
      assert.equal(got[key], want[key], `sniff ${name} ${key}`);
    }
    assert.equal(got.size, bytes.length, `sniff ${name} size`);
    checks++;
  }

  const validWav = join(dir, "valid.wav");
  await execFile(process.env.FFMPEG_BIN || "ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=997:duration=0.25",
    "-c:a", "pcm_s16le", "-y", validWav,
  ], { timeout: 10_000 });
  const valid = await sniffFile(validWav);
  assert.equal(valid.kind, "wav");
  assert.equal(valid.containerValid, true);
  assert.equal(valid.hasAudio, true);
  assert.equal(valid.hasVideo, false);
  assert.ok(valid.durationMs >= 200);
  checks += 5;

  const validMp4 = join(dir, "valid.mp4");
  await execFile(process.env.FFMPEG_BIN || "ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=size=64x48:rate=10", "-t", "0.5",
    "-c:v", "mpeg4", "-y", validMp4,
  ], { timeout: 10_000 });
  const video = await sniffFile(validMp4);
  assert.equal(video.kind, "mp4");
  assert.equal(video.containerValid, true);
  assert.equal(video.hasVideo, true);
  assert.equal(video.hasAudio, false);
  assert.equal(video.width, 64);
  assert.equal(video.height, 48);
  assert.ok(video.durationMs >= 400);
  checks += 7;

  await assert.rejects(sniffFile(join(dir, "inexistant")), /Contrôle Rust\/C/);
  checks++;
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(`OK : ${checks} vérifications Rust + C/libavformat`);
