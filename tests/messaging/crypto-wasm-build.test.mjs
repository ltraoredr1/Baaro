import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const buildScript = join(repoRoot, "scripts/build-messaging-crypto.mjs");
const tempDir = mkdtempSync(join(tmpdir(), "baaro-wasm-build-test-"));
const fakeWasmPack = join(tempDir, "wasm-pack-failing");
writeFileSync(
  fakeWasmPack,
  "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'wasm-pack 0.15.1'; exit 0; fi\nexit 23\n"
);
chmodSync(fakeWasmPack, 0o755);
after(() => rmSync(tempDir, { recursive: true, force: true }));

function runBuilder(args = [], extraEnv = {}) {
  return spawnSync(process.execPath, [buildScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      WASM_PACK: fakeWasmPack,
      VERCEL: "",
      ...extraEnv,
    },
  });
}

describe("messaging WASM build fallback", () => {
  it("uses committed artifacts when a present wasm-pack cannot build in non-strict mode", () => {
    const result = runBuilder();

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /artefacts versionnés utilisés/);
  });

  it("does not let Vercel bypass a strict source-to-artifact build", () => {
    const result = runBuilder(["--strict"], { VERCEL: "1" });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, / build .* --target web/);
  });
});
