import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const version = process.env.npm_package_version || "1.0.0";
const outDir = "public/updates";
mkdirSync(outDir, { recursive: true });

// 1. Zip dist/
execSync(`npx --yes archiver-cli dist ${outDir}/${version}.zip 2>/dev/null || (cd dist && zip -r ../${outDir}/${version}.zip . > /dev/null)`, { stdio: "inherit" });

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
console.log(`[Baaro] Update prêt : ${version} - sha256 ${sha256.slice(0, 12)}...`);
