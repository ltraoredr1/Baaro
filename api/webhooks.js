import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    const body = req.body;
    console.log('Webhook CinetPay reçu:', body);

    const { cpm_trans_id, cpm_status } = body;

    if (cpm_status !== 'ACCEPTED') {
      return res.status(200).json({ code: '00', message: 'Webhook reçu, statut ignoré' });
    }

    // Vérification anti-fraude
    const verifyResponse = await fetch('https://api-check.cinetpay.com/v2/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: cpm_trans_id
      })
    });

    const verifyData = await verifyResponse.json();

    if (verifyData.code !== '00' || verifyData.data?.status !== 'ACCEPTED') {
      console.error('Vérification échouée:', verifyData);
      return res.status(400).json({ code: '01', message: 'Vérification échouée' });
    }

    const userId = verifyData.data.cpm_custom;
    const amountPaid = parseFloat(verifyData.data.cpm_amount);
    const diamondsToAdd = Math.floor(amountPaid / 10);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase.rpc('add_diamonds_to_wallet', {
      p_user_id: userId,
      p_amount: diamondsToAdd,
      p_transaction_id: cpm_trans_id
    });

    if (error) throw error;

    await supabase
      .from('transactions')
      .update({ status: 'completed', diamonds_spent: diamondsToAdd })
      .eq('metadata->>cinetpay_transaction_id', cpm_trans_id);

    return res.status(200).json({ 
      code: '00', 
      message: 'Webhook traité avec succès',
      data: { user_id: userId, diamonds_added: diamondsToAdd }
    });

  } catch (error) {
    console.error('Erreur Webhook:', error);
    return res.status(500).json({ code: '01', message: 'Erreur serveur', error: error.message });
  }
}
