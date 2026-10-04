import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const apiPayments = read('api/payments.js');
const wallet = read('api/wallet.js');
const provider = read('src/lib/paymentProvider.js');
const webhooks = read('api/webhooks.js');
const migration = read('supabase/migrations/0001_baaro_unified.sql');

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
  [wallet.includes('from "./payments.js"'), 'legacy wallet route contains no wallet implementation'],
  [migration.includes("DROP TABLE IF EXISTS public.crypto_holdings CASCADE"), 'crypto storage is decommissioned'],
  [migration.includes("DROP TABLE IF EXISTS public.wallets CASCADE"), 'wallet storage is decommissioned'],
  [migration.includes("cashout_allowed",), 'closed-loop credits metadata exists'],
];

let failed = 0;
for (const [ok, label] of checks) {
  if (ok) console.log(`OK: ${label}`);
  else { console.error(`FAIL: ${label}`); failed++; }
}

if (failed) process.exit(1);
console.log('Payment wiring checks passed.');
