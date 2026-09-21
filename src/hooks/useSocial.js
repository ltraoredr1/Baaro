import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

export const useSocial = (id) => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFriends = useCallback(async () => {
    if (!id) { setFriends([]); return; }
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("get_user_friends", { user_id: id });
      if (error) throw error;
      if (!data?.length) { setFriends([]); return; }

      // RPC peut renvoyer friend_id ou id selon la version
      const friendIds = [...new Set(data.map(f => f.friend_id || f.id).filter(Boolean))].slice(0, 50);
      if (!friendIds.length) { setFriends([]); return; }

      const { data: profiles, error: pError } = await supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, flag")
      .in("id", friendIds);
      if (pError) throw pError;

      setFriends((profiles || []).map(p => ({
        id: p.id,
        username: p.display_name || p.handle || "Membre",
        full_name: p.display_name,
        handle: p.handle,
        avatar_url: p.avatar_url,
        flag: p.flag,
      })));
    } catch (err) {
      setError(err.message);
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Auto-fetch quand id change, pas besoin d'appeler à la main
  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  return { friends, fetchFriends, loading, error, reload: fetchFriends };
};
