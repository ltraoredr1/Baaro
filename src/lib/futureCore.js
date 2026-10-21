import { supabase } from '../supabaseClient.js';

export const FUTURE_CORE_MODULES = Object.freeze([
  'ai_agent','trust','anti_scam','translator','offline','commerce','creator','observability'
]);

export async function createAgentTask(user_id, goal) {
  const clean = String(goal || '').trim().slice(0, 2000);
  if (!user_id || !clean) throw new Error('goal_required');
  return supabase.from('ai_agent_tasks').insert({
    user_id: user_id,
    goal: clean,
    status: 'awaiting_confirmation',
    requires_confirmation: true,
    plan: [{ step: 'analyze_goal', status: 'pending', attempts: 0 }],
  }).select('*').single();
}

export async function recordSafetySignal({ user_id, targetType, targetId, riskLevel, reasons = [], action = 'review' }) {
  return supabase.from('safety_signals').insert({
    user_id: user_id || null,
    target_type: targetType,
    target_id: String(targetId),
    risk_level: riskLevel,
    reasons: Array.isArray(reasons) ? reasons.slice(0, 20) : [],
    action,
  });
}

export async function enqueueOfflineOperation({ user_id, clientId, operation, payload }) {
  if (!user_id || !clientId || !operation) throw new Error('invalid_offline_operation');
  return supabase.from('offline_sync_queue').upsert({
    user_id: user_id,
    client_id: clientId,
    operation,
    payload: payload || {},
    status: 'pending', attempts: 0,
    next_attempt_at: new Date().toISOString(),
  }, { onConflict: 'user_id,client_id' });
}

// --- PARTIE CORRIGÉE: PLUS DE TABLE future_preferences ---

export async function getFuturePreferences(user_id) {
  if (!user_id) return {};
  const { data, error } = await supabase
    .from('user_settings')
    .select('enabled_modules')
    .eq('user_id', user_id)
    .maybeSingle();
  
  if (error && error.code !== 'PGRST116') throw error;
  
  // Si pas encore de settings, tous activés par défaut
  if (!data?.enabled_modules || Object.keys(data.enabled_modules).length === 0) {
    return Object.fromEntries(FUTURE_CORE_MODULES.map(k => [k, true]));
  }
  return data.enabled_modules;
}

export async function setFuturePreference(user_id, module_key, enabled) {
  if (!user_id || !module_key) throw new Error('invalid_preference');
  if (!FUTURE_CORE_MODULES.includes(module_key)) throw new Error('unknown_module');
  
  const current = await getFuturePreferences(user_id);
  const next = { ...current, [module_key]: !!enabled };
  
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ 
      user_id: user_id, 
      enabled_modules: next,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select('enabled_modules')
    .single();
  
  if (error) throw error;
  return data.enabled_modules;
}

export async function toggleFutureModule(user_id, module_key) {
  const current = await getFuturePreferences(user_id);
  const newValue = !current[module_key];
  return setFuturePreference(user_id, module_key, newValue);
}

// Helper pour checker si un module est actif (pour ton UI)
export async function isModuleEnabled(user_id, module_key) {
  const prefs = await getFuturePreferences(user_id);
  return !!prefs[module_key];
}
