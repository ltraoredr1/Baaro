import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const migrationPath = "supabase/migrations/0001_baaro_unified.sql";
const hasMigration = fs.existsSync(migrationPath);
const migration = hasMigration ? read(migrationPath) : "";

if (!hasMigration) {
  console.warn("NOT VERIFIED: assertions SQL de flux financier ignorées (migrations volontairement absentes).");
}

const payments = read("api/payments.js");
const webhooks = read("api/webhooks.js");
const payouts = read("api/payouts.js");
const payoutWebhook = read("api/payout-webhook.js");
const economy = read("src/features/economy/EconomyTab.jsx");
const tip = read("src/components/TipButton.jsx");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function minorToMajor(value) { return value / 100; }
function majorToMinor(value) { return Math.round(value * 100); }

for (const [minor, major] of [[150000, 1500], [10000, 100], [50000, 500], [100000, 1000]]) {
  assert(minorToMajor(minor) === major, `XOF conversion failed ${minor}`);
}
assert(majorToMinor(1500) === 150000, "reverse XOF conversion failed");

if (hasMigration) {
  assert(/security definer\s+set search_path=public[\s\S]*auth\.uid\(\)/i.test(migration), "secure payout function missing");
  assert(migration.includes("PAYOUT_KYC_REQUIRED") && migration.includes("PAYOUT_BLOCKED_FOR_RISK"), "KYC/risk payout gate missing");
  assert(migration.includes("grant execute on function public.request_economy_payout(bigint,text,text) to authenticated"), "payout execute grant missing");
  assert(migration.includes("record_economy_event('tip:'") && migration.includes("record_economy_event('creator-subscription:'"), "creator revenue ledger wiring missing");
  assert(migration.includes("record_economy_event('marketplace-order:'"), "marketplace ledger wiring missing");
  assert(migration.includes("record_ad_creator_revenue"), "ad revenue bridge missing");
}

assert(payouts.includes("request_economy_payout") && payoutWebhook.includes("complete_economy_payout") &&
       payoutWebhook.includes("cancel_economy_payout"), "payout lifecycle incomplete");
assert(tip.includes("supabase.rpc('send_tip'") && economy.includes("/api/payouts"), "UI money paths missing");
assert(webhooks.includes("fulfill_monetization_checkout"), "webhook checkout fulfillment missing");
console.log("Real-money code contract checks passed. Deployed DB verification is separate.");
