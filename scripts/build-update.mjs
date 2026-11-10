import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version || "1.0.0";
const outDir = "public/updates";
mkdirSync(outDir, { recursive: true });

// 1. Zip dist/
console.log(`[Baaro] Build update ${version}...`);
execSync(`cd dist && zip -r ../${outDir}/${version}.zip . -q`, { stdio: "inherit" });

// 2. SHA256
const buf = readFileSync(join(outDir, `${version}.zip`));
const sha256 = createHash("sha256").update(buf).digest("hex");

// 3. Manifest
const manifest = {
  version,
  url: `https://baaro-xi.vercel.app/updates/${version}.zip`,
  sha256,
  mandatory: false,
  notes: `Baaro ${version} - updater maison`,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[Baaro] Update prêt : ${version} - ${sha256.slice(0, 12)}...`);
