import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const required = [
  "supabase/migrations/021_economy_payout_foundation.sql",
  "api/payout.js",
  "docs/versions/docs-BAARO-v17-PAYOUT.md",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function fileExists(relativePath) {
  const absolutePath = path.join(root, relativePath);

  try {
    return fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

const missing = required.filter((file) => !fileExists(file));

if (missing.length) {
  console.error("Missing payout foundation files:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const migrationPath = path.join(root, required[0]);

let sql;

try {
  sql = fs.readFileSync(migrationPath, "utf8");
} catch (error) {
  fail(`Unable to read payout migration: ${error.message}`);
}

const safetyMarkers = [
  "payout_accounts",
  "payout_requests",
  "idempotency_key",
  "payout_disabled_until_provider_configuration",
];

const missingMarkers = safetyMarkers.filter((token) => !sql.includes(token));

if (missingMarkers.length) {
  console.error("Missing payout safety markers:");
  missingMarkers.forEach((token) => console.error(`- ${token}`));
  process.exit(1);
}

console.log("Payout foundation checks: OK");
