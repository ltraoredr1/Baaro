import { createClient } from '@supabase/supabase-js';
import { corsHeaders, handleCors } from './_cors.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    const url = new URL(req.url);
    const battleId = url.searchParams.get('battle_id');

    // GET - Récupérer les PK Battles actifs
    if (req.method === 'GET') {
      if (battleId) {
        // Récupérer un battle spécifique
        const { data: battle, error } = await supabase
          .from('pk_battles')
          .select(`
            *,
            streamer_a:profiles!streamer_a_id(username, avatar_url),
            streamer_b:profiles!streamer_b_id(username, avatar_url)
          `)
          .eq('id', battleId)
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, battle }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Liste des battles actifs
        const { data: battles, error } = await supabase
          .from('pk_battles')
          .select(`
            *,
            streamer_a:profiles!streamer_a_id(username, avatar_url),
            streamer_b:profiles!streamer_b_id(username, avatar_url)
          `)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, battles: battles || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // POST - Créer ou gérer un PK Battle
    if (req.method === 'POST') {
      const body = await req.json();
      const { action, opponent_id, duration } = body;

      // Action: Créer un battle
      if (action === 'create') {
        if (!opponent_id) {
          return new Response(
            JSON.stringify({ error: 'Opponent ID requis' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const battleDuration = duration || 300; // 5 minutes par défaut
        const endTime = new Date(Date.now() + battleDuration * 1000).toISOString();

        const { data: battle, error } = await supabase
          .from('pk_battles')
          .insert({
            streamer_a_id: user.id,
            streamer_b_id: opponent_id,
            start_time: new Date().toISOString(),
            end_time: endTime,
            duration_seconds: battleDuration,
            status: 'active'
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(
          JSON.stringify({ 
            success: true, 
            battle,
            message: 'PK Battle créé avec succès'
          }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Action: Terminer un battle
      if (action === 'end') {
        if (!battleId) {
          return new Response(
            JSON.stringify({ error: 'Battle ID requis' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Récupérer le battle
        const { data: battle, error: fetchError } = await supabase
          .from('pk_battles')
          .select('*')
          .eq('id', battleId)
          .single();

        if (fetchError) throw fetchError;

        // Déterminer le gagnant
        let winnerId = null;
        if (battle.score_a > battle.score_b) {
          winnerId = battle.streamer_a_id;
        } else if (battle.score_b > battle.score_a) {
          winnerId = battle.streamer_b_id;
        }

        // Mettre à jour le battle
        const { data: updatedBattle, error: updateError } = await supabase
          .from('pk_battles')
          .update({
            status: 'finished',
            end_time: new Date().toISOString(),
            winner_id: winnerId
          })
          .eq('id', battleId)
          .select()
          .single();

        if (updateError) throw updateError;

        // Bonus pour le gagnant (ex: 100 pépites)
        if (winnerId) {
          await supabase.rpc('add_pepites_bonus', {
            p_user_id: winnerId,
            p_amount: 100,
            p_reason: 'pk_battle_win'
          });
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            battle: updatedBattle,
            winner_id: winnerId
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Action non valide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Live API Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
