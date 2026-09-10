import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) return res.status(401).json({ error: 'Non autorisé' });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const { amount, package_name } = req.body;

      if (!amount || amount < 100) {
        return res.status(400).json({ error: 'Montant minimum: 100 FCFA' });
      }

      const transactionId = `BAARO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const cinetPayData = {
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
        amount: amount,
        currency: 'XOF',
        channels: 'ALL',
        description: `Achat ${package_name || 'Diamants Baaro'}`,
        client_name: user.email || 'Utilisateur',
        cpm_custom: user.id,
        notify_url: `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/webhooks`,
        return_url: 'baaro://wallet'
      };

      const response = await fetch('https://api.cinetpay.com/v2/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(cinetPayData)
      });

      const result = await response.json();

      if (result.code !== '00') {
        throw new Error(result.description || 'Erreur CinetPay');
      }

      await supabase.from('transactions').insert({
        sender_id: null,
        receiver_id: user.id,
        transaction_type: 'topup',
        amount_xof: amount,
        status: 'pending',
        metadata: { cinetpay_transaction_id: transactionId }
      });

      return res.status(200).json({
        success: true,
        payment_url: result.data?.payment_url || result.payment_url,
        transaction_id: transactionId
      });
    }

    if (req.method === 'GET') {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('transaction_type', 'topup')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return res.status(200).json({ success: true, transactions: transactions || [] });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error) {
    console.error('Payments API Error:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}
