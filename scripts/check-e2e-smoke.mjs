/**
 * Smoke checks BAARO — garde-fous CI (version stricte Étape 6).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;

function fail(msg) {
  console.error("FAIL:", msg);
  failures++;
}
function ok(msg) {
  console.log("OK:", msg);
}

// ——— Fichiers critiques ———
const requiredFiles = [
  "src/app/tabs.jsx",
  "src/app/MainShell.jsx",
  "src/components/Navigation.jsx",
  "src/components/OfflineBanner.jsx",
  "src/components/EmptyState.jsx",
  "src/components/LazyMedia.jsx",
  "src/components/ErrorBoundary.jsx",
  "api/wallet.js",
  "api/payments.js",
  "api/webhooks.js",
  "api/chat.js",
  "api/_cors.js",
  "api/_rateLimit.js",
  "api/_logger.js",
  "api/_supabaseAdmin.js",
  "capacitor.config.json",
  "vercel.json",
  "supabase/migrations/023_marketplace_orders.sql",
  "supabase/migrations/024_companies_and_services.sql",
  "supabase/migrations/027_marketplace_economy_security.sql",
];

for (const f of requiredFiles) {
  if (fs.existsSync(path.join(root, f))) ok(`file ${f}`);
  else fail(`missing ${f}`);
}

// ——— Contrainte api/ ≤ 12 fichiers JS ———
const apiJs = fs
  .readdirSync(path.join(root, "api"))
  .filter((n) => n.endsWith(".js") && fs.statSync(path.join(root, "api", n)).isFile());
if (apiJs.length <= 12) ok(`api/ JS files: ${apiJs.length} ≤ 12`);
else fail(`api/ has ${apiJs.length} JS files (max 12): ${apiJs.sort().join(", ")}`);

// ——— Navigation / tabs ———
const nav = fs.readFileSync(path.join(root, "src/components/Navigation.jsx"), "utf8");
if (nav.includes('id: "shop"') || nav.includes("id: 'shop'")) ok("Navigation contains shop tab");
else fail("Navigation missing shop tab id");

const tabsPath = path.join(root, "src/app/tabs.jsx");
if (fs.existsSync(tabsPath)) {
  const tabs = fs.readFileSync(tabsPath, "utf8");
  if (tabs.includes("shop")) ok("tabs.jsx maps shop");
  else fail("tabs.jsx missing shop");
}

const mainShell = fs.readFileSync(path.join(root, "src/app/MainShell.jsx"), "utf8");
if (mainShell.includes("OfflineBanner")) ok("MainShell mounts OfflineBanner");
else fail("MainShell missing OfflineBanner");
if (mainShell.includes("ErrorBoundary")) ok("MainShell uses ErrorBoundary");
else fail("MainShell missing ErrorBoundary");

// ——— Paiements ———
const pay = fs.readFileSync(path.join(root, "api/payments.js"), "utf8");
if (pay.includes("cinetpay") && pay.includes("stripe")) ok("payments contains CinetPay + Stripe");
else fail("payments provider support incomplete");

const hooks = fs.readFileSync(path.join(root, "api/webhooks.js"), "utf8");
if (
  (hooks.includes("handleCinetPay") || hooks.includes("CinetPay")) &&
  (hooks.includes("handleStripe") || hooks.includes("Stripe"))
) {
  ok("webhooks contains CinetPay + Stripe");
} else fail("webhooks provider support incomplete");
if (hooks.includes("mark_order_paid")) ok("webhooks calls mark_order_paid");
else fail("webhooks missing mark_order_paid");

// ——— Sécurité marketplace (027) ———
const m027 = fs.readFileSync(
  path.join(root, "supabase/migrations/027_marketplace_economy_security.sql"),
  "utf8"
);
if (m027.includes("create_order_secure")) ok("027 has create_order_secure");
else fail("027 missing create_order_secure");
if (m027.includes("mark_order_paid")) ok("027 has mark_order_paid");
else fail("027 missing mark_order_paid");
if (m027.includes("service_role")) ok("027 restricts mark_order_paid to service_role");
else fail("027 mark_order_paid not locked to service_role");

// ——— vercel rewrites ———
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const rewrites = [
  ['"/api/create-payment"', "create-payment"],
  ['"/api/payment-webhook"', "payment-webhook"],
  ['"/api/stripe-webhook"', "stripe-webhook"],
];
for (const [needle, label] of rewrites) {
  if (vercel.includes(needle)) ok(`rewrite ${label}`);
  else fail(`rewrite missing: ${label}`);
}

// ——— Rate-limit async présent ———
const rl = fs.readFileSync(path.join(root, "api/_rateLimit.js"), "utf8");
if (rl.includes("rateLimitAsync") && rl.includes("UPSTASH")) ok("rateLimitAsync + Upstash ready");
else fail("_rateLimit.js missing rateLimitAsync/Upstash");

// ——— Live URL optionnelle ———
const base = process.env.BAARO_BASE_URL;
if (base) {
  try {
    const res = await fetch(base.replace(/\/?$/, "/"));
    if (res.ok) ok(`HTTP ${res.status} ${base}`);
    else fail(`HTTP ${res.status} ${base}`);
  } catch (e) {
    fail(`fetch ${base}: ${e.message}`);
  }
} else {
  console.log("SKIP live URL (set BAARO_BASE_URL to probe)");
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll smoke checks passed.");
process.exit(failures ? 1 : 0);
