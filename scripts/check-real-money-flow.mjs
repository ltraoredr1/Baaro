import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const mig=read('supabase/migrations/0001_baaro_unified.sql');
const payments=read('api/payments.js');
const webhooks=read('api/webhooks.js');
const payouts=read('api/payouts.js');
const payoutWebhook=read('api/payout-webhook.js');
const economy=read('src/features/economy/EconomyTab.jsx');
const tip=read('src/components/TipButton.jsx');
function assert(c,m){if(!c)throw new Error(m)}
function minorToMajor(n){return n/100}
function majorToMinor(n){return Math.round(n*100)}
for(const [minor,major] of [[150000,1500],[10000,100],[50000,500],[100000,1000]]) assert(minorToMajor(minor)===major,`XOF conversion failed ${minor}`);
assert(majorToMinor(1500)===150000,'reverse XOF conversion failed');
assert(/security definer\s+set search_path=public[\s\S]*auth\.uid\(\)/i.test(mig),'secure payout function missing');
assert(mig.includes('PAYOUT_KYC_REQUIRED') && mig.includes('PAYOUT_BLOCKED_FOR_RISK'),'KYC/risk payout gate missing');
assert(mig.includes("grant execute on function public.request_economy_payout(bigint,text,text) to authenticated"),'payout execute grant missing');
assert(mig.includes("record_economy_event('tip:'") && mig.includes("record_economy_event('creator-subscription:'"),'creator revenue ledger wiring missing');
assert(mig.includes("record_economy_event('marketplace-order:'"),'marketplace ledger wiring missing');
assert(mig.includes('record_ad_creator_revenue'),'ad revenue bridge missing');
assert(payouts.includes('request_economy_payout') && payoutWebhook.includes('complete_economy_payout') && payoutWebhook.includes('cancel_economy_payout'),'payout lifecycle incomplete');
assert(tip.includes("supabase.rpc('send_tip'") && economy.includes('/api/payouts'),'UI money paths missing');
assert(webhooks.includes('fulfill_monetization_checkout'),'webhook checkout fulfillment missing');
console.log('Real-money flow contract tests passed.');
