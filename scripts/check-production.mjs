#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
let failures = 0;
function fail(msg){console.error(`FAIL: ${msg}`);failures++;}
function isFile(rel){try{return fs.statSync(path.join(root,rel)).isFile()}catch{return false}}
function isDir(rel){try{return fs.statSync(path.join(root,rel)).isDirectory()}catch{return false}}
const requiredFiles=['package.json','vite.config.js','capacitor.config.json','SECURITY.md','vercel.json','.env.example','scripts/security-audit-scan.mjs','scripts/check-upstash-production.mjs','api/_shared.js'];
for(const f of requiredFiles){if(!isFile(f))fail(`MISSING required file: ${f}`)}
let pkg=null;
if(isFile('package.json')){try{pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))}catch(e){fail(`INVALID package.json: ${e.message}`)}}
const requiredScripts=['build','check:lock','check:production','audit:security','check:upstash','check:e2e','check:e2e:smoke','check:payout','check:secrets','check:performance','check:android','ci'];
if(pkg){for(const s of requiredScripts){if(typeof pkg.scripts?.[s]!=='string'||!pkg.scripts[s].trim())fail(`MISSING or empty npm script: ${s}`)}}
if(isFile('vercel.json')){try{const v=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));const headers=JSON.stringify(v.headers||[]);['Content-Security-Policy','Strict-Transport-Security','X-Content-Type-Options','X-Frame-Options'].forEach(h=>{if(!headers.includes(h))fail(`vercel.json: missing security header ${h}`)})}catch(e){fail(`vercel.json invalid: ${e.message}`)}}
if(isFile('.env.example')){const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');if(!env.includes('UPSTASH_REDIS_REST_URL'))fail('.env.example missing UPSTASH_REDIS_REST_URL');if(!env.includes('VITE_SUPABASE_URL'))fail('.env.example missing VITE_SUPABASE_URL')}
['api','src','scripts','public'].forEach(d=>{if(!isDir(d))fail(`MISSING directory: ${d}`)});
if(isFile('api/_shared.js')){const shared=fs.readFileSync(path.join(root,'api/_shared.js'),'utf8');if(!shared.includes('rateLimitAsync')||!shared.includes('upstashConfigured'))fail('api/_shared.js: rateLimitAsync / Upstash logic missing');if(!shared.includes('isProduction')||!shared.includes('rate_limit_unavailable'))fail('api/_shared.js: production fail-closed rate-limit path missing')}
if(failures>0){console.error(`\nProduction readiness: ${failures} failure(s).`);process.exit(1)}
console.log('Production readiness configuration: OK');
console.log('Migrations are intentionally left out of this gate.');
