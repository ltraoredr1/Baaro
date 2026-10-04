import { supabase } from '../supabaseClient.js';

export const FUTURE_CORE_MODULES = Object.freeze([
  'ai_agent','trust','anti_scam','translator','offline','commerce','creator','observability'
]);

export async function createAgentTask(userId, goal) {
  const clean = String(goal || '').trim().slice(0, 2000);
  if (!userId || !clean) throw new Error('goal_required');
  return supabase.from('ai_agent_tasks').insert({
    user_id: userId,
    goal: clean,
    status: 'awaiting_confirmation',
    requires_confirmation: true,
    plan: [{ step: 'analyze_goal', status: 'pending' }],
  }).select('*').single();
}

export async function recordSafetySignal({ userId, targetType, targetId, riskLevel, reasons = [], action = 'review' }) {
  return supabase.from('safety_signals').insert({
    user_id: userId || null,
    target_type: targetType,
    target_id: String(targetId),
    risk_level: riskLevel,
    reasons: Array.isArray(reasons) ? reasons.slice(0, 20) : [],
    action,
  });
}

export async function enqueueOfflineOperation({ userId, clientId, operation, payload }) {
  if (!userId || !clientId || !operation) throw new Error('invalid_offline_operation');
  return supabase.from('offline_sync_queue').upsert({
    user_id: userId,
    client_id: clientId,
    operation,
    payload: payload || {},
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
  }, { onConflict: 'user_id,client_id' });
}

export async function getFuturePreferences(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.from('future_preferences').select('module_key,enabled').eq('user_id', userId);
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.module_key, row.enabled]));
}
