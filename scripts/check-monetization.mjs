import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0001_baaro_unified.sql");
const hasMigration = fs.existsSync(migrationPath);
if (!hasMigration) {
  console.warn("NOT VERIFIED: assertions SQL de monétisation non exécutées (migrations volontairement absentes).");
}

const panel = fs.readFileSync(path.join(root, "src/features/economy/MonetizationPanel.jsx"), "utf8");
if (!panel.includes("Préparer le paiement")) throw new Error("Monetization UI missing checkout action");

const apiDir = path.join(root, "api");
if (fs.existsSync(apiDir)) {
  const entries = fs.readdirSync(apiDir).sort().join("\n");
  if (!entries.includes("webhooks.js")) throw new Error("API baseline changed unexpectedly");
}
console.log("Monetization code/UI checks passed. Supabase schema verification is separate.");
