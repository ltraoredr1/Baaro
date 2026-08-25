/**
 * Smoke checks BAARO — garde-fous CI.
 * FIX: ne plus matcher "locale.split" via "locale.spli"
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

const requiredFiles = [
  "src/app/tabs.jsx",
  "src/app/MainShell.jsx",
  "src/components/Navigation.jsx",
  "src/features/shop/ShopTab.jsx",
  "src/features/shop/ShopRegistrationForm.jsx",
  "api/wallet.js",
  "api/create-payment.js",
  "api/payment-webhook.js",
  "api/_cors.js",
  "api/_rateLimit.js",
  "api/_supabaseAdmin.js",
  "capacitor.config.json",
  "vercel.json",
];

for (const f of requiredFiles) {
  if (fs.existsSync(path.join(root, f))) ok(`file ${f}`);
  else fail(`missing ${f}`);
}

const nav = fs.readFileSync(path.join(root, "src/components/Navigation.jsx"), "utf8");
if (nav.includes('id: "shop"') || nav.includes("id: 'shop'")) ok("Navigation contains shop tab");
else fail("Navigation missing shop tab id");

const tabs = fs.readFileSync(path.join(root, "src/app/tabs.jsx"), "utf8");
if (tabs.includes("shop:")) ok("tabs.jsx maps shop");
else fail("tabs.jsx missing shop");

const mainShell = fs.readFileSync(path.join(root, "src/app/MainShell.jsx"), "utf8");
if (mainShell.includes("shop:")) ok("MainShell tabProps.shop");
else fail("MainShell missing shop props");

const reg = fs.readFileSync(
  path.join(root, "src/features/shop/ShopRegistrationForm.jsx"),
  "utf8"
);
if (/\.spli\s*\(/.test(reg)) fail("ShopRegistrationForm still has split typo (.spli()");
else ok("ShopRegistrationForm split syntax");
if (reg.includes(".selec'")) fail("ShopRegistrationForm still has select typo");
else ok("ShopRegistrationForm select syntax");

const pay = fs.readFileSync(path.join(root, "api/create-payment.js"), "utf8");
if (pay.includes("requireUser")) ok("create-payment uses requireUser");
else fail("create-payment missing requireUser");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
if (vercel.includes("Content-Security-Policy")) ok("CSP header in vercel.json");
else fail("CSP missing in vercel.json");

const base = process.env.BAARO_BASE_URL;
if (base) {
  try {
    const res = await fetch(base.replace(/\/$/, "/"));
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
