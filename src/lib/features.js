import { supabase } from '../supabaseClient.js';
export const FUTURE_CORE_MODULES = Object.freeze(['ai_agent','trust','anti_scam','translator','offline','commerce','creator','observability']);
export async function getFuturePreferences(user_id) {
  if (!user_id) return {};
  const { data } = await supabase.from('user_settings').select('enabled_modules').eq('user_id', user_id).maybeSingle();
  return data?.enabled_modules || {};
}
export async function setFuturePreference(user_id, module_key, enabled) {
  const cur = await getFuturePreferences(user_id);
  const next = { ...cur, [module_key]: !!enabled };
  return supabase.from('user_settings').upsert({ user_id, enabled_modules: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}
export async function createAgentTask(user_id, goal) {
  return supabase.from('ai_agent_tasks').insert({ user_id, goal: String(goal).trim().slice(0,2000), status: 'awaiting_confirmation', requires_confirmation: true, plan: [{ step: 'analyze_goal', status: 'pending', attempts: 0 }] }).select('*').single();
}
export async function recordSafetySignal(p) {
  return supabase.from('safety_signals').insert({ user_id: p.user_id||null, target_type: p.targetType, target_id: String(p.targetId), risk_level: p.riskLevel, reasons: p.reasons||[], action: p.action||'review' });
}
export async function enqueueOfflineOperation(p) {
  return supabase.from('offline_sync_queue').upsert({ user_id: p.user_id, client_id: p.clientId, operation: p.operation, payload: p.payload||{}, status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString() }, { onConflict: 'user_id,client_id' });
}
