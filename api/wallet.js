import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  // Gestion CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Authentification
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // GET - Récupérer le solde
    if (req.method === 'GET') {
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return res.status(200).json({
        success: true,
        wallet: wallet || {
          user_id: user.id,
          diamonds_balance: 0,
          pepites_balance: 0
        }
      });
    }

    // POST - Actions (send_gift, withdraw)
    if (req.method === 'POST') {
      const { action, amount, payment_method, account_details, receiver_id, gift_id, pk_battle_id } = req.body;

      if (action === 'send_gift') {
        if (!receiver_id || !gift_id) {
          return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const { data, error } = await supabase.rpc('process_gift_transaction', {
          p_sender_id: user.id,
          p_receiver_id: receiver_id,
          p_gift_id: gift_id,
          p_pk_battle_id: pk_battle_id || null
        });

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json(data);
      }

      if (action === 'withdraw') {
        if (!amount || !payment_method || !account_details) {
          return res.status(400).json({ error: 'Paramètres manquants' });
        }

        const { data, error } = await supabase.rpc('request_withdrawal', {
          p_user_id: user.id,
          p_amount_pepites: amount,
          p_payment_method: payment_method,
          p_account_details: account_details
        });

        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Action non valide' });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error) {
    console.error('Wallet API Error:', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
}
