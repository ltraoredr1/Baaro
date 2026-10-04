import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useCurrentUser } from '../../hooks/useCommunity';
import { COLORS } from '../../theme.js';
import { UserPlus, Clock, Users } from 'lucide-react';

// Émet une demande d'ami (follows.is_friend = true, status 'pending').
// FriendRequests.jsx (déjà existant) gère la RÉCEPTION et l'acceptation de ces demandes ;
// ce composant gère l'ENVOI, ce qui manquait pour boucler le flux "ami".
const FriendRequestButton = ({ targetId }) => {
  const { id } = useCurrentUser();
  const [state, setState] = useState('loading'); // loading | none | pending_sent | pending_received | friends
  const isSelf = id === targetId;

  const check = useCallback(async () => {
    if (!id || !targetId || isSelf) { setState('none'); return; }
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from('follows').select('status, is_friend').eq('follower_id', id).eq('followed_id', targetId).maybeSingle(),
      supabase.from('follows').select('status, is_friend').eq('follower_id', targetId).eq('followed_id', id).maybeSingle(),
    ]);
    if (sent?.is_friend && sent.status === 'accepted') setState('friends');
    else if (sent?.is_friend && sent.status === 'pending') setState('pending_sent');
    else if (received?.is_friend && received.status === 'pending') setState('pending_received');
    else setState('none');
  }, [id, targetId, isSelf]);

  useEffect(() => { check(); }, [check]);

  const sendRequest = async (e) => {
    e.stopPropagation();
    if (!id || !targetId || isSelf) return;
    setState('pending_sent');
    try {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: id, followed_id: targetId, status: 'pending', is_friend: true });
      // 23505 = doublon (déjà une ligne follower/followed) : sans gravité, on garde l'état affiché.
      if (error && error.code !== '23505') throw error;
    } catch (err) {
      console.error(err);
      setState('none');
    }
  };

  if (isSelf || state === 'loading') return null;

  if (state === 'friends') {
    return (
      <span className="px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
        <Users size={13} /> Amis
      </span>
    );
  }
  if (state === 'pending_sent') {
    return (
      <span className="px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5" style={{ background: COLORS.surface2, color: COLORS.muted }}>
        <Clock size={13} /> Demande envoyée
      </span>
    );
  }
  if (state === 'pending_received') {
    return (
      <span className="px-4 py-1.5 rounded-full text-xs font-black" style={{ background: COLORS.surface2, color: COLORS.gold }}>
        Vous a demandé en ami
      </span>
    );
  }
  return (
    <button
      onClick={sendRequest}
      className="px-4 py-1.5 rounded-full text-xs font-black transition-all active:scale-95 hover:scale-105 shadow-lg flex items-center gap-1.5"
      style={{ background: `linear-gradient(135deg, ${COLORS.gold}, #ff8c42)`, color: COLORS.bg }}
    >
      <UserPlus size={13} /> Ajouter
    </button>
  );
};

export default FriendRequestButton;

