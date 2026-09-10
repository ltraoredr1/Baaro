import { createClient } from '@supabase/supabase-js';
import { corsHeaders, handleCors } from './_cors.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CINETPAY_API_KEY = Deno.env.get('CINETPAY_API_KEY');
const CINETPAY_SITE_ID = Deno.env.get('CINETPAY_SITE_ID');

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return handleCors(req, new Response(null, { headers: corsHeaders }));
  }

  try {
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // POST - Créer une transaction CinetPay
    if (req.method === 'POST') {
      const body = await req.json();
      const { amount, package_name } = body;

      if (!amount || amount < 100) {
        return new Response(
          JSON.stringify({ error: 'Montant minimum: 100 FCFA' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Générer un ID de transaction unique
      const transactionId = `BAARO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Données pour CinetPay
      const cinetPayData = {
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
        amount: amount,
        currency: 'XOF',
        channels: 'ALL',
        description: `Achat ${package_name || 'Diamants Baaro'}`,
        client_name: user.email || user.user_metadata?.username || 'Utilisateur',
        cpm_custom: user.id, // Important: on stocke l'user_id ici
        notify_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhooks`,
        return_url: 'baaro://wallet', // Deep link pour l'app mobile
        success_url: 'baaro://wallet/success',
        error_url: 'baaro://wallet/error'
      };

      // Appel à l'API CinetPay
      const response = await fetch('https://api.cinetpay.com/v2/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(cinetPayData)
      });

      const result = await response.json();

      if (result.code !== '00') {
        throw new Error(result.description || 'Erreur CinetPay');
      }

      // Enregistrer la transaction en attente
      await supabase.from('transactions').insert({
        sender_id: null,
        receiver_id: user.id,
        transaction_type: 'topup',
        amount_xof: amount,
        status: 'pending',
        metadata: {
          cinetpay_transaction_id: transactionId,
          package_name: package_name || 'Diamants Baaro'
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          payment_url: result.data?.payment_url || result.payment_url,
          transaction_id: transactionId,
          message: 'Redirection vers CinetPay'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET - Historique des paiements
    if (req.method === 'GET') {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('transaction_type', 'topup')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          transactions: transactions || []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Payments API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
