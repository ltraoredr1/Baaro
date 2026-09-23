import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const required = [
  "package.json",
  "vite.config.js",
  "capacitor.config.json",
  "docs/SECURITY.md",
  "scripts/security-audit-scan.mjs",
];

const npmScripts = [
  "build",
  "check:lock",
  "check:e2e",
  "audit:security",
  "check:payout",
];

const envExamples = [
  ".env.example",
  ".env.production.example",
];

let bad = 0;

function isFile(relativePath) {
  const fullPath = path.join(root, relativePath);

  try {
    return fs.statSync(fullPath).isFile();
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  bad++;
}

for (const file of required) {
  if (!isFile(file)) {
    fail(`MISSING ${file}`);
  }
}

const packagePath = path.join(root, "package.json");
let pkg = null;

if (isFile("package.json")) {
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch (error) {
    fail(`INVALID package.json: ${error.message}`);
  }
}

if (pkg) {
  for (const script of npmScripts) {
    if (typeof pkg.scripts?.[script] !== "string" || !pkg.scripts[script].trim()) {
      fail(`MISSING npm script ${script}`);
    }
  }
}

for (const file of envExamples) {
  if (!isFile(file)) {
    fail(`MISSING ${file}`);
  }
}

if (bad) {
  process.exit(1);
}

console.log("Production readiness configuration: OK");
console.log(
  "Live deployment, secrets, DNS, provider credentials and CI runners still require environment validation."
);
