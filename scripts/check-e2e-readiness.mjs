import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = 0;

const fail = (m) => { console.error(`FAIL: ${m}`); failed++; };
const ok = (m) => console.log(`OK: ${m}`);
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const required = [
  "package.json",
  "package-lock.json",
  "capacitor.config.json",
  "vercel.json",
  "src/app/tabs.jsx",
  "src/app/MainShell.jsx",
  "src/contexts/AppContext.jsx",
  "api/_shared.js",
  "api/live.js",
  "api/social.js",
  "api/wallet.js",
  "api/webhooks.js",
  "supabase/migrations/038_identity_id_only_and_profile_persistence.sql",
  "supabase/migrations/041_canonical_identity_unique.sql",
  "supabase/migrations/049_fix_phone_auth_id_only.sql",
  "supabase/migrations/052_identity_profile_final_hardening.sql",
];
for (const p of required) exists(p) ? ok(`file ${p}`) : fail(`missing ${p}`);

const pkg = JSON.parse(read("package.json"));
for (const script of ["build", "check:lock", "audit:security", "check:e2e", "check:e2e:smoke", "check:performance", "check:android"]) {
  if (!pkg.scripts?.[script]) fail(`npm script missing: ${script}`);
}

const apiDir = path.join(root, "api");
if (exists("api")) {
  const files = fs.readdirSync(apiDir).filter((n) => n.endsWith(".js") && fs.statSync(path.join(apiDir, n)).isFile());
  files.length <= 12 ? ok(`api/ JS files: ${files.length} <= 12`) : fail(`api/ has ${files.length} JS files (max 12): ${files.join(", ")}`);
}

const identity = read("supabase/migrations/052_identity_profile_final_hardening.sql");
for (const marker of ["profiles.id", "auth.users(id)", "handle_new_user", "profiles_id_fkey", "profiles.user_id still exists"]) {
  identity.includes(marker) ? ok(`identity hardening marker: ${marker}`) : fail(`identity hardening marker missing: ${marker}`);
}

const social = read("api/social.js");
for (const marker of ["handleComment", "handleReaction", "handleBlock", "handleReport", "handleStory", "handleNotification", 'from("comments")', "author_id: userId", "comments_count", "notification_id", "source_id", "actor_id", "user.id"]) {
  social.includes(marker) ? ok(`social contract: ${marker}`) : fail(`social contract missing: ${marker}`);
}

const wallet = read("api/wallet.js");
wallet.includes("payout_unavailable") && wallet.includes("503") ? ok("payout remains disabled-by-default") : fail("wallet payout safety contract missing");

const vercel = JSON.parse(read("vercel.json"));
const apiFiles = new Set(fs.readdirSync(apiDir).filter((n) => n.endsWith(".js")).map((n) => `/api/${n}`));
for (const rule of vercel.rewrites || []) {
  const destination = rule.destination || "";
  const match = destination.match(/^\/api\/([a-z0-9_-]+)(?:\?|$)/i);
  if (match && !apiFiles.has(`/api/${match[1]}.js`)) fail(`vercel destination points to missing API: ${destination}`);
}

if (failed) process.exit(1);
console.log("E2E readiness / production contract checks: OK");
