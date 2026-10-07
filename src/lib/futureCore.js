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

export async function getFuturePreferences(user_id) {
  if (!user_id) return {};
  const { data, error } = await supabase.from('future_preferences').select('module_key,enabled').eq('user_id', user_id);
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.module_key, row.enabled]));
}
