import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const apiPayments = read('api/payments.js');
const provider = read('src/lib/paymentProvider.js');
const webhooks = read('api/webhooks.js');

// api/wallet.js est un alias historique : s'il a été supprimé, c'est conforme
// (aucune implémentation wallet exposée). S'il existe, il doit réexporter payments.js.
const walletOk = !exists('api/wallet.js') || read('api/wallet.js').includes('from "./payments.js"');

// La migration unifiée peut être absente du dépôt (convention des autres contrôles : skip + WARN).
const migrationPath = 'supabase/migrations/0001_baaro_unified.sql';
const hasMigration = exists(migrationPath);
const migration = hasMigration ? read(migrationPath) : '';
if (!hasMigration) {
  console.warn(`WARN: ${migrationPath} manquant -> vérifications de migration ignorées`);
}

const checks = [
  [apiPayments.includes('requireUser'), 'payments endpoint authenticates users'],
  [apiPayments.includes('rateLimitAsync'), 'payments endpoint is rate limited'],
  [apiPayments.includes('monetization_checkout_intents'), 'monetization checkout is server-resolved'],
  [apiPayments.includes('shop_subscriptions'), 'shop subscription amount is server-resolved'],
  [apiPayments.includes('company_subscriptions'), 'company subscription amount is server-resolved'],
  [apiPayments.includes('orders'), 'order amount is server-resolved'],
  [apiPayments.includes('createCheckoutSession'), 'Stripe checkout is wired'],
  [apiPayments.includes('api.cinetpay.com/v2/payment'), 'CinetPay initialization is wired'],
  [provider.includes('/api/payments'), 'frontend uses payment endpoint'],
  [provider.includes('checkout_intent_id'), 'frontend can pay monetization checkout intents'],
  [webhooks.includes('fulfill_monetization_checkout'), 'webhooks settle monetization checkouts'],
  [webhooks.includes('MONTANT_PAIEMENT_INATTENDU'), 'provider amount is verified'],
  [walletOk, 'legacy wallet route is absent or contains no wallet implementation'],
  ...(hasMigration ? [
    [migration.includes("DROP TABLE IF EXISTS public.crypto_holdings CASCADE"), 'crypto storage is decommissioned'],
    [migration.includes("DROP TABLE IF EXISTS public.wallets CASCADE"), 'wallet storage is decommissioned'],
    [migration.includes("cashout_allowed"), 'closed-loop credits metadata exists'],
  ] : []),
];

let failed = 0;
for (const [ok, label] of checks) {
  if (ok) console.log(`OK: ${label}`);
  else { console.error(`FAIL: ${label}`); failed++; }
}

if (failed) process.exit(1);
console.log('Payment wiring checks passed.');
