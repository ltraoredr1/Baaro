import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/features/future/FutureCorePanel.jsx',
  'src/lib/futureCore.js',
  'supabase/migrations/0001_baaro_unified.sql',
  'public/brand/baaro-logo.png',
  'worker/Dockerfile',
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Future Core missing:', missing.join(', '));
  process.exit(1);
}
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/0001_baaro_unified.sql'), 'utf8');
for (const token of ['future_preferences','ai_agent_tasks','trust_events','safety_signals','offline_sync_queue','creator_revenue_events','observability_events']) {
  if (!sql.includes(token)) throw new Error(`missing SQL object: ${token}`);
}
console.log('BAARO Future Core: OK');
