import { createClient } from '@supabase/supabase-js';
import { corsHeaders, handleCors } from './_cors.js';
import { rateLimit, checkRateLimit } from './_rateLimit.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

// Initialisation Supabase
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

export default async function handler(req) {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    return handleCors(req, new Response(null, { headers: corsHeaders }));
  }

  try {
    // Vérification rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    await checkRateLimit(clientIP, 'wallet');

    // Authentification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Token manquant' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // GET - Récupérer le solde du wallet
    if (req.method === 'GET') {
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return new Response(
        JSON.stringify({
          success: true,
          wallet: wallet || {
            user_id: user.id,
            diamonds_balance: 0,
            pepites_balance: 0,
            total_deposited: 0,
            total_withdrawn: 0
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST - Actions sur le wallet
    if (req.method === 'POST') {
      const body = await req.json();
      const { action, amount, payment_method, account_details, receiver_id, gift_id, pk_battle_id } = body;

      // Action: Demander un retrait
      if (action === 'withdraw') {
        if (!amount || !payment_method || !account_details) {
          return new Response(
            JSON.stringify({ error: 'Paramètres manquants' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('request_withdrawal', {
          p_user_id: user.id,
          p_amount_pepites: amount,
          p_payment_method: payment_method,
          p_account_details: account_details
        });

        if (error) throw error;

        return new Response(
          JSON.stringify(data),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Action: Envoyer un cadeau
      if (action === 'send_gift') {
        if (!receiver_id || !gift_id) {
          return new Response(
            JSON.stringify({ error: 'Paramètres manquants' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase.rpc('process_gift_transaction', {
          p_sender_id: user.id,
          p_receiver_id: receiver_id,
          p_gift_id: gift_id,
          p_pk_battle_id: pk_battle_id || null
        });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify(data),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Action non valide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Méthode non autorisée
    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Wallet API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      { 
        status: error.message?.includes('insuffisant') ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
