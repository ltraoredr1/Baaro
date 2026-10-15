/**
 * BAARO — Vérification configuration notifications (100 %)
 * Usage: node scripts/check-notifications.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let errors = 0;
let warnings = 0;

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}
function warn(msg) {
  warnings += 1;
  console.log(`  ⚠️  ${msg}`);
}
function fail(msg) {
  errors += 1;
  console.log(`  ❌ ${msg}`);
}

console.log("\n🔔 BAARO — check:notifications\n");

// 1. VAPID public (frontend)
const publicKey =
  process.env.VITE_VAPID_PUBLIC_KEY ||
  process.env.VAPID_PUBLIC_KEY ||
  "";
if (!publicKey) {
  fail("VITE_VAPID_PUBLIC_KEY absente — push web désactivé");
  console.log("     → npx web-push generate-vapid-keys");
} else if (!/^[A-Za-z0-9_-]{20,}$/.test(publicKey)) {
  fail("VITE_VAPID_PUBLIC_KEY format invalide");
} else {
  ok("VAPID public key présente");
}

// 2. VAPID private (backend only)
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
if (!privateKey) {
  warn("VAPID_PRIVATE_KEY absente (requis pour /api/send-push)");
} else {
  ok("VAPID private key présente");
}

const subject = process.env.VAPID_SUBJECT || "";
if (!subject) {
  warn("VAPID_SUBJECT non défini (défaut mailto:support@baaro.app)");
} else {
  ok(`VAPID_SUBJECT = ${subject}`);
}

// 3. Fichiers critiques
const critical = [
  "src/lib/pushNotifications.js",
  "src/lib/notificationPreferences.js",
  "src/hooks/useNotificationSound.js",
  "src/hooks/usePushNotifications.js",
  "public/service-worker.js",
  "api/send-push.js",
];

for (const rel of critical) {
  const p = resolve(root, rel);
  if (existsSync(p)) ok(`fichier ${rel}`);
  else fail(`manquant: ${rel}`);
}

// 4. Sons BAARO Original
const soundIds = [
  "baaro_pulse",
  "sahel_beat",
  "nko_glow",
  "market_hustle",
  "live_drop",
  "creator_rise",
  "baaro_signature",
];

const soundsDir = resolve(root, "public/sounds");
const altSounds = resolve(root, "sounds");

for (const id of soundIds) {
  const mp3A = resolve(soundsDir, `${id}.mp3`);
  const mp3B = resolve(altSounds, `${id}.mp3`);
  if (existsSync(mp3A) || existsSync(mp3B)) {
    ok(`son ${id}.mp3`);
  } else {
    warn(`son manquant: ${id}.mp3 (placer dans public/sounds/)`);
  }
}

// 5. Préférences — wallet présent ?
try {
  const prefsPath = resolve(root, "src/lib/notificationPreferences.js");
  if (existsSync(prefsPath)) {
    const src = readFileSync(prefsPath, "utf8");
    if (src.includes("wallet")) ok("préférence wallet présente");
    else fail("préférence wallet absente de notificationPreferences.js");
    if (src.includes("shouldNotify")) ok("shouldNotify exporté");
    else warn("shouldNotify manquant");
  }
} catch {
  /* ignore */
}

// 6. SW push handler
try {
  // Le service worker réellement enregistré est /sw.js, généré par
  // vite-plugin-pwa ; il charge public/push-sw.js via workbox.importScripts.
  const sw = resolve(root, "public/push-sw.js");
  if (existsSync(sw)) {
    const src = readFileSync(sw, "utf8");
    if (src.includes('addEventListener("push"') || src.includes("addEventListener('push'")) {
      ok("push-sw gère l'événement push");
    } else {
      fail("push-sw sans handler push");
    }
    if (src.includes("notificationclick")) ok("push-sw gère notificationclick");
    else warn("notificationclick manquant");
  } else {
    fail("public/push-sw.js absent : aucune notification Web Push ne s'affichera");
  }

  const viteConfig = readFileSync(resolve(root, "vite.config.js"), "utf8");
  if (viteConfig.includes("importScripts") && viteConfig.includes("push-sw.js")) {
    ok("vite.config.js charge push-sw.js dans /sw.js");
  } else {
    fail("vite.config.js ne charge pas push-sw.js (workbox.importScripts)");
  }
} catch {
  /* ignore */
}

console.log("\n────────────────────────────────");
if (errors === 0 && warnings === 0) {
  console.log("✅ Notifications : configuration 100 % OK\n");
  process.exit(0);
}
if (errors === 0) {
  console.log(`⚠️  ${warnings} avertissement(s) — push partiellement prêt\n`);
  process.exit(0);
}
console.log(`❌ ${errors} erreur(s), ${warnings} avertissement(s)\n`);
process.exit(1);
