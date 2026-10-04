import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const sql=fs.readFileSync(path.join(root,"supabase/migrations/0001_baaro_unified.sql"),"utf8");
const required=["economy_accounts","economy_payouts","request_economy_payout","complete_economy_payout","cancel_economy_payout","SERVICE_ROLE_REQUIRED","MIN_CASHOUT"];
const missing=required.filter(x=>!sql.includes(x));
if(missing.length){console.error("Missing payout controls:",missing.join(", "));process.exit(1)}
if(!/revoke update, delete on public\.economy_payouts from authenticated, anon/.test(sql)){console.error("Payout writes are not locked down");process.exit(1)}
console.log("Payout foundation checks: OK");
