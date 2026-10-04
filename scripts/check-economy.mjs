import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'supabase/migrations/0001_baaro_unified.sql'),'utf8');
const required=[
 'economy_policies','economy_accounts','economy_ledger','economy_payouts',
 'record_economy_event','settle_economy_event','request_economy_payout',
 'complete_economy_payout','cancel_economy_payout','get_economy_dashboard',
 'SERVICE_ROLE_REQUIRED','MIN_CASHOUT'
];
for(const x of required) if(!migration.includes(x)) throw new Error(`Missing economy control: ${x}`);
if(migration.includes('create table if not exists public.economy_ledger (') && !migration.includes('idx_economy_ledger_idempotency')) throw new Error('Ledger idempotency index missing');
const ui=fs.readFileSync(path.join(root,'src/features/economy/EconomyTab.jsx'),'utf8');
for(const x of ['get_economy_dashboard','set_creator_monetization_enabled','/api/payouts']) if(!ui.includes(x)) throw new Error(`Economy UI missing ${x}`);
const tabs=fs.readFileSync(path.join(root,'src/app/tabs.jsx'),'utf8');
if(!tabs.includes('economy:')) throw new Error('Economy tab not registered');
console.log('Economy checks passed.');
