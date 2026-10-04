import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Liste les amis d'un utilisateur.
 * userId = auth.users.id uniquement.
 */
export const useSocial = (userId) => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFriends = useCallback(async () => {
    if (!isValidAuthUserId(userId)) {
      setFriends([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_user_friends", {
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;

      const ids = [
        ...new Set(
          (data || [])
            .map((f) => f.friend_id || f.followed_id || f.following_id || f.id)
            .filter((x) => isValidAuthUserId(x))
        ),
      ].slice(0, 100);

      if (!ids.length) {
        setFriends([]);
        return;
      }

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, flag")
        .in("id", ids);
      if (pErr) throw pErr;
      setFriends(profiles || []);
    } catch (e) {
      console.error("[useSocial]", e);
      setError(e.message || "Erreur chargement amis");
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  return { friends, loading, error, reload: fetchFriends };
};

export default useSocial;
