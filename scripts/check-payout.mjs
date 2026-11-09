import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "supabase", "migrations", "0001_baaro_unified.sql");

if (!fs.existsSync(migrationPath)) {
  console.warn("NOT VERIFIED: les migrations SQL sont volontairement absentes du dépôt.");
  console.warn("Les contrôles du schéma/RPC de paiement ne peuvent pas être exécutés ici.");
  console.warn("Aucun SQL n'a été créé, restauré ou appliqué.");
  process.exit(0);
}

const sql = fs.readFileSync(migrationPath, "utf8");
const required = [
  "economy_accounts", "economy_payouts", "request_economy_payout",
  "complete_economy_payout", "cancel_economy_payout",
  "SERVICE_ROLE_REQUIRED", "MIN_CASHOUT"
];
const missing = required.filter(x => !sql.includes(x));
if (missing.length) {
  console.error("Missing payout controls:", missing.join(", "));
  process.exit(1);
}
if (!/revoke update, delete on public\.economy_payouts from authenticated, anon/.test(sql)) {
  console.error("Payout writes are not locked down");
  process.exit(1);
}
console.log("Payout schema checks: OK (migration file inspected).");
