import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["package.json", "package manifest"],
  ["capacitor.config.json", "Capacitor config"],
  ["supabase/migrations/016_video_views_feed_integrity.sql", "video view integrity migration"],
  ["supabase/migrations/017_messaging_calls_integrity.sql", "messaging/calls migration"],
  ["supabase/migrations/018_live_integrity_realtime.sql", "live migration"],
  ["supabase/migrations/019_ai_routing_foundation.sql", "AI routing migration"],
  ["supabase/migrations/020_notifications_foundation.sql", "notifications migration"],
  ["supabase/migrations/021_economy_payout_foundation.sql", "payout migration"],
  ["api/chat.js", "chat API"],
  ["api/payout.js", "payout API"],
  ["api/wallet.js", "wallet API"],
];

let failed = 0;
for (const [file, label] of checks) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`FAIL: ${label} missing (${file})`);
    failed++;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const scriptsRequired = [
  "build", "check:lock", "check:ai", "check:notifications",
  "check:performance", "check:android", "check:payout"
];
for (const name of scriptsRequired) {
  if (!pkg.scripts?.[name]) {
    console.error(`FAIL: npm script missing: ${name}`);
    failed++;
  }
}

const sqlFiles = [
  "016_video_views_feed_integrity.sql",
  "017_messaging_calls_integrity.sql",
  "018_live_integrity_realtime.sql",
  "019_ai_routing_foundation.sql",
  "020_notifications_foundation.sql",
  "021_economy_payout_foundation.sql",
];

for (const file of sqlFiles) {
  const p = path.join(root, "supabase/migrations", file);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, "utf8").toLowerCase();

  // Catch accidental destructive statements in the new hardening migrations.
  for (const forbidden of ["drop schema public", "drop table public.wallets", "truncate public.wallets"]) {
    if (text.includes(forbidden)) {
      console.error(`FAIL: destructive SQL marker in ${file}: ${forbidden}`);
      failed++;
    }
  }
}

const payout = fs.readFileSync(path.join(root, "api/payout.js"), "utf8");
if (!payout.includes("payout_unavailable") || !payout.includes("503")) {
  console.error("FAIL: payout must remain disabled-by-default");
  failed++;
}

if (failed) {
  console.error(`E2E readiness checks failed: ${failed}`);
  process.exit(1);
}

console.log("E2E readiness / contract checks: OK");
console.log("Full browser/device E2E still requires a configured Supabase project, provider keys, and Android/Web test runners.");
