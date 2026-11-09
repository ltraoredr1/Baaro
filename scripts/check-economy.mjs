import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "supabase", "migrations", "0001_baaro_unified.sql");
const hasMigration = fs.existsSync(migrationPath);
const migration = hasMigration ? fs.readFileSync(migrationPath, "utf8") : "";

if (hasMigration) {
  const required = [
    "economy_policies", "economy_accounts", "economy_ledger", "economy_payouts",
    "record_economy_event", "settle_economy_event", "request_economy_payout",
    "complete_economy_payout", "cancel_economy_payout", "get_economy_dashboard",
    "SERVICE_ROLE_REQUIRED", "MIN_CASHOUT"
  ];
  for (const token of required) {
    if (!migration.includes(token)) throw new Error(`Missing economy control: ${token}`);
  }
  if (migration.includes("create table if not exists public.economy_ledger (") &&
      !migration.includes("idx_economy_ledger_idempotency")) {
    throw new Error("Ledger idempotency index missing");
  }
} else {
  console.warn("NOT VERIFIED: schéma Economy/RPC non inspectable depuis le dépôt (migrations volontairement absentes).");
}

const ui = fs.readFileSync(path.join(root, "src/features/economy/EconomyTab.jsx"), "utf8");
for (const token of ["get_economy_dashboard", "set_creator_monetization_enabled", "/api/payouts"]) {
  if (!ui.includes(token)) throw new Error(`Economy UI missing ${token}`);
}
const tabs = fs.readFileSync(path.join(root, "src/app/tabs.jsx"), "utf8");
if (!tabs.includes("economy:")) throw new Error("Economy tab not registered");

console.log("Economy code/UI checks passed. Supabase schema verification is separate.");
