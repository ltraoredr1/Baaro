import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'supabase/migrations/0001_baaro_unified.sql'),'utf8');
const panel=fs.readFileSync(path.join(root,'src/features/economy/MonetizationPanel.jsx'),'utf8');
const required=['monetization_products','monetization_checkout_intents','premium_subscriptions','tips','post_boosts','sponsored_polls','vip_group_subscriptions','user_cosmetics','merchant_pro_subscriptions','local_ad_campaigns','service_bookings','api_plans','api_keys','live_tickets','baaro_credits_accounts','affiliate_attributions','ai_usage_daily','job_profile_boosts','profile_view_premium','live_trainings','b2b_insight_exports','start_monetization_checkout','fulfill_monetization_checkout'];
for(const x of required){if(!migration.includes(x)) throw new Error(`Missing monetization artifact: ${x}`)}
if(!panel.includes('Préparer le paiement')) throw new Error('Monetization UI missing checkout action');
if(fs.existsSync(path.join(root,'api'))) {
 const entries=fs.readdirSync(path.join(root,'api')).sort().join('\n');
 if(!entries.includes('webhooks.js')) throw new Error('API baseline changed unexpectedly');
}
console.log('Monetization v20 checks passed.');
