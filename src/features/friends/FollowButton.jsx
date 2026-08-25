import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient.js';
import { useToast } from '../../components/ToastContext.jsx'; // Assurez-vous que ce chemin est correct

export default function FollowButton({ targetUserId, currentUserId }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!currentUserId || !targetUserId) return;
    
    // Vérifier l'état initial
    const checkFollow = async () => {
      const { data, error } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', currentUserId)
        .eq('followed_id', targetUserId)
        .maybeSingle(); // maybeSingle() est plus sûr que single() si aucun résultat n'est trouvé
      
      if (!error) {
        setIsFollowing(!!data);
      }
    };
    
    checkFollow();

    // Écouter les changements en temps réel
    const channel = supabase.channel(`follows:${targetUserId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'follows', 
        filter: `followed_id=eq.${targetUserId}` 
      }, () => {
        checkFollow(); // Rafraîchir l'état si quelqu'un s'abonne/se désabonne
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, targetUserId]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('followed_id', targetUserId);
        
        if (!error) {
          setIsFollowing(false);
          showToast('Désabonné', 'info');
        }
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ 
            follower_id: currentUserId, 
            followed_id: targetUserId 
          });
        
        if (!error) {
          setIsFollowing(true);
          showToast('Abonnement réussi !', 'success');
        }
      }
    } catch (error) {
      console.error('Erreur follow:', error);
      showToast('Erreur lors de l\'action', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ne pas afficher le bouton si l'utilisateur regarde son propre profil
  if (currentUserId === targetUserId) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`px-4 py-2 rounded-full font-medium transition-all duration-200 flex items-center gap-2 ${
        isFollowing 
          ? 'bg-gray-200 text-gray-800 hover:bg-red-100 hover:text-red-600' 
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {loading ? (
        <span className="animate-pulse">...</span>
      ) : isFollowing ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Abonné
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          S'abonner
        </>
      )}
    </button>
  );
}
