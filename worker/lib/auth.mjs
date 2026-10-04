import { config } from './config.mjs';

export async function requireSupabaseUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Authentification requise');
    error.status = 401;
    throw error;
  }
  if (!config.supabase.url || !config.supabase.anonKey) {
    const error = new Error('Supabase worker non configuré');
    error.status = 500;
    throw error;
  }
  const response = await fetch(`${config.supabase.url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: config.supabase.anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error('Session invalide ou expirée');
    error.status = 401;
    throw error;
  }
  return response.json();
}
