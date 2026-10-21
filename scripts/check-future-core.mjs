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

// --- VERSION UNIFORME: plus de table future_preferences ---
const requiredTokens = [
  // Nouveau système uniforme
  'user_settings',           // remplace future_preferences, security_settings, module_preferences, nexus_preferences
  'enabled_modules',         // JSON qui contient tous les modules
  // Tables core conservées
  'ai_agent_tasks',
  'trust_events',
  'safety_signals',
  'offline_sync_queue',
  'creator_revenue_events',
  'observability_events',
  // Vérifie que profiles contient les champs privés
  'first_name',
  'last_name',
  'birth_date',
  'phone'
];

for (const token of requiredTokens) {
  if (!sql.includes(token)) throw new Error(`missing SQL object: ${token}`);
}

// Vérifie qu'on n'a PAS les anciens doublons
const forbiddenTokens = ['future_preferences', 'profile_private', 'security_settings', 'module_preferences', 'nexus_preferences'];
for (const token of forbiddenTokens) {
  if (sql.includes(token)) {
    throw new Error(`forbidden legacy table still present: ${token} - doit être supprimé pour l'uniformisation`);
  }
}

console.log('BAARO Future Core: OK - Uniform schema validated');
console.log('✓ user_settings.enabled_modules present');
console.log('✓ legacy tables removed (future_preferences, profile_private, etc.)');
console.log('✓ profiles contains private fields');
