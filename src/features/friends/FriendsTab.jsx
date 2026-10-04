import { useSocial } from '../../hooks/useSocial.js';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useCurrentUser } from '../../hooks/useCommunity';
import { COLORS } from '../../theme';

export const FriendsTab = ({ onOpenProfile }) => {
  const { id } = useCurrentUser();
  const [friends, setFriends] = useState([]);
  const { friends: socialFriends, loading: socialLoading, reload: reloadSocial } = useSocial(id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFriends = async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_friends', { user_id: id });
      if (!rpcError && rpcData?.length) {
        const ids = rpcData.map(f => f.friend_id || f.id).filter(Boolean);
        if (ids.length) {
          const { data: profiles } = await supabase.from('profiles').select('id, display_name, handle, avatar_url, country, language, flag').in('id', ids);
          setFriends(profiles || []);
        } else setFriends([]);
      } else {
        const { data: follows } = await supabase.from('follows').select('followed_id').eq('follower_id', id).eq('status', 'accepted');
        if (follows?.length) {
          const followedIds = follows.map(f => f.followed_id);
          const { data: reciprocal } = await supabase.from('follows').select('follower_id').eq('followed_id', id).eq('status', 'accepted').in('follower_id', followedIds);
          const reciprocalIds = new Set((reciprocal||[]).map(r => r.follower_id));
          const friendIds = followedIds.filter(fid => reciprocalIds.has(fid));
          if (friendIds.length) {
            const { data: profiles } = await supabase.from('profiles').select('id, display_name, handle, avatar_url, country, language, flag').in('id', friendIds);
            setFriends(profiles || []);
          } else setFriends([]);
        } else setFriends([]);
      }
    } catch (e) {
      console.error('FriendsTab error', e);
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (socialFriends?.length) setFriends(socialFriends);
  }, [socialFriends]);

  useEffect(() => {
    if (id) fetchFriends();
    else setLoading(false);
  }, [id]);

  if (!id) return <div className="p-4 text-center" style={{ color: COLORS.muted }}>Veuillez vous connecter pour voir vos amis.</div>;
  if (loading) return <div className="p-4 text-center" style={{ color: COLORS.muted }}>Chargement...</div>;
  if (error) return <div className="p-4 text-center" style={{ color: '#ff4444' }}>Erreur : {error}</div>;

  return (
    <div className="friends-tab-container p-4">
      <h3 className="text-xl font-bold mb-4" style={{ color: COLORS.ivory }}>Mes Amis ({friends.length})</h3>
      {friends.length === 0 ? (
        <p style={{ color: COLORS.muted }}>Pas encore d'amis réciproques.</p>
      ) : (
        <ul className="friends-list space-y-2">
          {friends.map((friend) => (
            <li key={friend.id} className="friend-card flex items-center gap-3 p-3 rounded-[14px] border-2 cursor-pointer hover:border-amber-400/30" style={{ background: COLORS.surface2, borderColor: COLORS.border }} onClick={() => onOpenProfile?.(friend.id)}>
              <img src={friend.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${friend.display_name||'A'}`} alt={friend.display_name} className="w-12 h-12 rounded-full object-cover border-2" style={{ borderColor: COLORS.gold }} />
              <div className="flex-1 min-w-0">
                <div className="font-black text-[14px] truncate" style={{ color: COLORS.ivory }}>{friend.display_name || friend.id}</div>
                <div className="text-xs truncate" style={{ color: COLORS.muted }}>@{friend.handle || 'membre'} • {friend.country||'International'}</div>
              </div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
