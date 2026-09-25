import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
const fail = (m) => { console.error("FAIL:", m); failures++; };
const ok = (m) => console.log("OK:", m);
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const required = [
  "src/app/tabs.jsx",
  "src/app/MainShell.jsx",
  "src/components/Navigation.jsx",
  "src/components/OfflineBanner.jsx",
  "src/components/EmptyState.jsx",
  "src/components/LazyMedia.jsx",
  "src/components/ErrorBoundary.jsx",
  "src/contexts/AppContext.jsx",
  "api/_shared.js",
  "api/live.js",
  "api/referral.js",
  "api/register-device.js",
  "api/social.js",
  "api/translate.js",
  "api/wallet.js",
  "api/webhooks.js",
  "capacitor.config.json",
  "vercel.json",
  "supabase/migrations/024_companies_and_services.sql",
  "supabase/migrations/038_identity_id_only_and_profile_persistence.sql",
  "supabase/migrations/052_identity_profile_final_hardening.sql",
];
for (const f of required) exists(f) ? ok(`file ${f}`) : fail(`missing ${f}`);

const apiDir = path.join(root, "api");
const apiJs = exists("api") ? fs.readdirSync(apiDir).filter((n) => n.endsWith(".js") && fs.statSync(path.join(apiDir, n)).isFile()) : [];
apiJs.length <= 12 ? ok(`api/ JS files: ${apiJs.length} <= 12`) : fail(`api/ has ${apiJs.length} JS files`);

const nav = read("src/components/Navigation.jsx");
nav.includes("shop") ? ok("Navigation contains shop") : fail("Navigation missing shop");
const tabs = read("src/app/tabs.jsx");
tabs.includes("shop") ? ok("tabs.jsx maps shop") : fail("tabs.jsx missing shop");
[tabs.includes("lazyRetry"), tabs.includes("features/feed"), tabs.includes("features/videos"), tabs.includes("features/messaging")].every(Boolean) ? ok("tabs lazy-loading contract") : fail("tabs lazy-loading contract incomplete");

const shell = read("src/app/MainShell.jsx");
shell.includes("OfflineBanner") ? ok("MainShell mounts OfflineBanner") : fail("MainShell missing OfflineBanner");
shell.includes("ErrorBoundary") ? ok("MainShell uses ErrorBoundary") : fail("MainShell missing ErrorBoundary");

const appContext = read("src/contexts/AppContext.jsx");
for (const marker of [".from(\"profiles\")", 'onConflict: "id"', "updated_at", "updateProfile"]) {
  appContext.includes(marker) ? ok(`profile persistence contract: ${marker}`) : fail(`profile persistence marker missing: ${marker}`);
}

const social = read("api/social.js");
for (const marker of ["handleComment", "handleReaction", 'from("comments")', "comments_count", "notification_id", "source_id", "actor_id"]) {
  social.includes(marker) ? ok(`social contract: ${marker}`) : fail(`social contract missing: ${marker}`);
}

const vercel = JSON.parse(read("vercel.json"));
const apiSet = new Set(apiJs.map((n) => `/api/${n}`));
for (const rule of vercel.rewrites || []) {
  const m = String(rule.destination || "").match(/^\/api\/([\w-]+)(?:\?|$)/);
  if (m && !apiSet.has(`/api/${m[1]}.js`)) fail(`missing Vercel API destination: ${rule.destination}`);
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll smoke checks passed.");
