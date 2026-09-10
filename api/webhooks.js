import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from './_cors.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CINETPAY_API_KEY = Deno.env.get('CINETPAY_API_KEY');
const CINETPAY_SITE_ID = Deno.env.get('CINETPAY_SITE_ID');

export default async function handler(req) {
  try {
    // CinetPay envoie en POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Méthode non autorisée' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    console.log('Webhook CinetPay reçu:', body);

    const { cpm_trans_id, cpm_status, cpm_custom } = body;

    // Vérifier que le paiement est accepté
    if (cpm_status !== 'ACCEPTED') {
      console.log('Paiement non accepté:', cpm_status);
      return new Response(
        JSON.stringify({ code: '00', message: 'Webhook reçu' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérification auprès de l'API CinetPay (anti-fraude)
    const verifyResponse = await fetch('https://api-check.cinetpay.com/v2/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: cpm_trans_id
      })
    });

    const verifyData = await verifyResponse.json();
    console.log('Vérification CinetPay:', verifyData);

    if (verifyData.code !== '00' || verifyData.data?.status !== 'ACCEPTED') {
      console.error('Vérification échouée:', verifyData);
      return new Response(
        JSON.stringify({ code: '01', message: 'Vérification échouée' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer les infos de la transaction vérifiée
    const userId = verifyData.data.cpm_custom;
    const amountPaid = parseFloat(verifyData.data.cpm_amount);
    
    // Calculer les diamants (ex: 100 FCFA = 10 diamants)
    const diamondsToAdd = Math.floor(amountPaid / 10);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Créditer l'utilisateur via la fonction RPC
    const { data, error } = await supabase.rpc('add_diamonds_to_wallet', {
      p_user_id: userId,
      p_amount: diamondsToAdd,
      p_transaction_id: cpm_trans_id
    });

    if (error) {
      console.error('Erreur lors du crédit:', error);
      throw error;
    }

    // Mettre à jour la transaction pending
    await supabase
      .from('transactions')
      .update({ 
        status: 'completed',
        diamonds_spent: diamondsToAdd
      })
      .eq('metadata->>cinetpay_transaction_id', cpm_trans_id);

    console.log(`✅ Utilisateur ${userId} crédité de ${diamondsToAdd} diamants`);

    // Ici, vous pouvez ajouter:
    // - Envoi de notification push
    // - Webhook vers n8n pour automation
    // - Email de confirmation

    return new Response(
      JSON.stringify({ 
        code: '00', 
        message: 'Webhook traité avec succès',
        data: {
          user_id: userId,
          diamonds_added: diamondsToAdd
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur Webhook:', error);
    return new Response(
      JSON.stringify({ code: '01', message: 'Erreur serveur', error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
