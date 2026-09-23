import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

export const useSocial = (userId) => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFriends = useCallback(async () => {
    if (!userId) { setFriends([]); return; }
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc("get_user_friends", {
        p_user_id: userId, // compat avec tes 2 signatures
        user_id: userId
      });
      if (error) throw error;

      const ids = [...new Set((data || []).map(f =>
        f.friend_id || f.followed_id || f.following_id || f.id
      ).filter(Boolean))].slice(0, 100);

      if (!ids.length) { setFriends([]); return; }

      const { data: profiles, error: pErr } = await supabase
       .from("profiles")
       .select("id, display_name, handle, avatar_url, flag, is_online")
       .in("id", ids);
      if (pErr) throw pErr;

      // filtre bloqués
      const { data: blocks } = await supabase.from("blocks")
       .select("blocked_id").eq("blocker_id", userId);
      const blockedSet = new Set((blocks||[]).map(b=>b.blocked_id));

      setFriends((profiles||[])
       .filter(p =>!blockedSet.has(p.id))
       .map(p => ({
          id: p.id,
          username: p.display_name || p.handle || "Membre",
          full_name: p.display_name,
          handle: p.handle,
          avatar_url: p.avatar_url,
          flag: p.flag,
          is_online: p.is_online,
        }))
      );
    } catch (e) {
      setError(e.message); setFriends([]);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  return { friends, loading, error, reload: fetchFriends, fetchFriends };
};
