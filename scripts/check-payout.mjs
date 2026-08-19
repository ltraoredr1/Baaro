import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "supabase/migrations/021_economy_payout_foundation.sql",
  "api/payout.js",
  "docs-BAARO-v17-PAYOUT.md"
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error("Missing payout foundation files:");
  missing.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
const sql = fs.readFileSync(path.join(root, required[0]), "utf8");
for (const token of ["payout_accounts", "payout_requests", "idempotency_key", "payout_disabled_until_provider_configuration"]) {
  if (!sql.includes(token)) {
    console.error(`Missing payout safety marker: ${token}`);
    process.exit(1);
  }
}
console.log("Payout foundation checks: OK");
