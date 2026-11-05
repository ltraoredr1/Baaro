#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
let failures=0;
function fail(msg){console.error(`FAIL: ${msg}`);failures++}
const sharedPath=path.join(root,'api/_shared.js');
if(!fs.existsSync(sharedPath)){fail('api/_shared.js not found');process.exit(1)}
const code=fs.readFileSync(sharedPath,'utf8');
if(!code.includes('rate_limit_unavailable')&&!code.includes('Protection anti-abus temporairement indisponible'))fail('Missing rate_limit_unavailable / fail-closed response');
if(!code.includes('isProduction()')&&!code.includes('VERCEL_ENV === "production"'))fail('Missing production environment detection');
if(!code.includes('UPSTASH_REDIS_REST_URL')||!code.includes('UPSTASH_REDIS_REST_TOKEN'))fail('Upstash environment variables not referenced');
if(failures>0){console.error(`\nUpstash production check: ${failures} failure(s).`);process.exit(1)}
console.log('Upstash production invariant: OK');
