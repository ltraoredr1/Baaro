import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from './ToastContext'; // Votre contexte de notification existant

export default function FollowButton({ targetUserId, currentUserId }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!currentUserId || !targetUserId) return;
    
    // Vérifier l'état initial
    const checkFollow = async () => {
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', currentUserId)
        .eq('followed_id', targetUserId)
        .single();
      setIsFollowing(!!data);
    };
    checkFollow();

    // Écouter les changements en temps réel
    const channel = supabase.channel(`follows:${targetUserId}`)
      .on('postgres_changes', { 
        event: '*', schema: 'public', table: 'follows', 
        filter: `followed_id=eq.${targetUserId}` 
      }, () => {
        checkFollow(); // Rafraîchir l'état si quelqu'un s'abonne/se désabonne
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentUserId, targetUserId]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('followed_id', targetUserId);
        showToast('Désabonné', 'info');
      } else {
        await supabase.from('follows').insert({ follower_id: currentUserId, followed_id: targetUserId });
        showToast('Abonnement réussi !', 'success');
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      showToast('Erreur lors de l\'action', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (currentUserId === targetUserId) return null; // Ne pas s'abonner à soi-même

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-4 py-2 rounded-full font-medium transition-all ${
        isFollowing 
          ? 'bg-gray-200 text-gray-800 hover:bg-red-100 hover:text-red-600' 
          : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {loading ? '...' : isFollowing ? 'Abonné' : 'S\'abonner'}
    </button>
  );
      }
