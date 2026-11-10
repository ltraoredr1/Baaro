import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outDir = join(root, "public", "wasm");
const rustc = process.env.RUSTC || join(process.env.CARGO_HOME || join(homedir(), ".cargo"), "bin", "rustc");
const clang = process.env.CLANG || "clang";
const strict = process.argv.includes("--strict");
const outputs = [join(outDir, "offline_core.wasm"), join(outDir, "offline_payload.wasm")];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.error?.message || result.status}).`);
  }
}

if (process.env.VERCEL && outputs.every(existsSync)) {
  console.log("Vercel: offline WASM artefacts already present; compilation skipped.");
  process.exit(0);
}
await mkdir(outDir, { recursive: true });

const jobs = [
  {
    output: outputs[0], label: "Rust offline core",
    run: () => run(rustc, [
      "--edition=2021", "--target=wasm32-unknown-unknown", "--crate-type=cdylib",
      "-C", "opt-level=z", "-C", "panic=abort",
      resolve(root, "src/features/offline/native/offline_core.rs"),
      "-o", outputs[0],
    ]),
  },
  {
    output: outputs[1], label: "C offline payload validator",
    run: () => run(clang, [
      "--target=wasm32-unknown-unknown", "-std=c11", "-Oz", "-nostdlib",
      "-Wl,--no-entry", "-Wl,--export=offline_payload_buffer",
      "-Wl,--export=offline_validate_payload", "-Wl,--export-memory",
      resolve(root, "src/features/offline/native/offline_payload.c"),
      "-o", outputs[1],
    ]),
  },
];

for (const job of jobs) {
  try {
    job.run();
    console.log(`Built ${job.label}`);
  } catch (error) {
    if (strict || !existsSync(job.output)) throw error;
    console.warn(`${job.label} compilation unavailable; keeping checked-in artifact: ${error.message}`);
  }
}
console.log("Offline Rust/C WASM ready.");
