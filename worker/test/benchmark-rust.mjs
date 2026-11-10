// Benchmark local du contrôle Rust + C/libavformat réellement utilisé par le worker.
// Usage : BAARO_MEDIA_BIN=rust/baaro-media/target/release/baaro-media node test/benchmark-rust.mjs
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { sniffFile } from "../lib/native.mjs";

const execFile = promisify(execFileCallback);
const iterations = Number(process.env.BENCH_SNIFF_ITERS || 200);
const warmupIterations = 10;
const rustBin = process.env.BAARO_MEDIA_BIN || "./rust/baaro-media/target/release/baaro-media";
const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";
const { stdout: versionOutput } = await execFile(rustBin, ["--version"], { timeout: 5000 });
const version = versionOutput.trim();

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

async function measure(fn) {
  for (let i = 0; i < warmupIterations; i++) await fn();
  const timings = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }
  const meanMs = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  return {
    samples: iterations,
    median_ms: Number(percentile(timings, 0.5).toFixed(3)),
    p95_ms: Number(percentile(timings, 0.95).toFixed(3)),
    mean_ms: Number(meanMs.toFixed(3)),
    operations_per_second: Number((1000 / meanMs).toFixed(1)),
  };
}

const fixtureDir = await mkdtemp(join(tmpdir(), "baaro-native-bench-"));
try {
  const sampleFile = join(fixtureDir, "sample.wav");
  await execFile(ffmpegBin, [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=997:duration=0.25",
    "-c:a", "pcm_s16le", "-y", sampleFile,
  ], { timeout: 10_000 });

  const result = await measure(async () => {
    const probed = await sniffFile(sampleFile);
    if (probed.kind !== "wav" || !probed.containerValid || !probed.hasAudio) {
      throw new Error("Validation Rust/C incorrect");
    }
  });

  console.log(JSON.stringify({
    benchmark: "BAARO Rust signature + C/libavformat validation",
    timestamp: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    node: process.version,
    rustAndC: version,
    rustBinary: rustBin,
    note: "Mesure du coût complet du processus CLI et du probe sur un média réel; à compléter par des mesures Cloud Run.",
    result,
  }, null, 2));
} finally {
  await rm(fixtureDir, { recursive: true, force: true });
}
