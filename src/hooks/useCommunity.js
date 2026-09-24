import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient.js";

const PAGE_SIZE = 50;
const MSG_COLUMNS = "id, channel_id, sender_id, text, created_at";
const PROFILE_COLUMNS = "id, display_name, handle, avatar_url";

/** auth.users.id (UUID) */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Fusionne deux listes de messages (sans doublon, triée du plus ancien au plus récent) */
function mergeMessages(a, b) {
  const map = new Map();
  for (const m of a) map.set(m.id, m);
  for (const m of b) map.set(m.id, { ...map.get(m.id), ...m });
  return [...map.values()].sort(
    (x, y) => new Date(x.created_at) - new Date(y.created_at)
  );
}

export function useCurrentUser() {
  const [id, setId] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    let mounted = true;
    // getSession lit la session locale (pas d'appel réseau, contrairement à getUser)
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setId(data?.session?.user?.id || null);
        setLoadingUser(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) {
        setId(session?.user?.id || null);
        setLoadingUser(false);
      }
    });
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { id, loadingUser };
}

/**
 * Communauté : groupes, canaux, membres, modération.
 * Les écritures sensibles passent par les RPC Supabase (migration v4).
 */
export function useCommunity(externalId) {
  const { id: authId } = useCurrentUser();
  const id = externalId || authId;
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // silent = true : recharge sans afficher le spinner (après une action)
  const loadAll = useCallback(
    async (silent = false) => {
      if (!isValidAuthUserId(id)) {
        setGroups([]);
        setFriends([]);
        setAllUsers([]);
        setLoading(false);
        return;
      }
      if (silent !== true) setLoading(true);
      setError(null);
      try {
        const { data, error: gError } = await supabase
          .from("groups")
          .select(
            `
            id, name, description, avatar_url, owner_id, created_at,
            is_public, category,
            channels (id, group_id, name, type, description, topic, created_at),
            group_members (group_id, user_id, role, joined_at)
          `
          )
          .order("created_at", { ascending: false })
          .limit(40);
        if (gError) throw gError;

        setGroups(
          (data || []).map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            avatar_url: g.avatar_url,
            owner_id: g.owner_id,
            created_at: g.created_at,
            category: g.category || "community",
            is_public: g.is_public !== false,
            members: g.group_members || [],
            channels: g.channels || [],
          }))
        );

        // Amis / utilisateurs (non bloquant)
        try {
          const [friendsRes, usersRes] = await Promise.all([
            supabase.rpc("get_user_friends", { user_id: id }),
            supabase
              .from("profiles")
              .select("id, display_name, handle, avatar_url, flag")
              .limit(30),
          ]);
          const ids = (friendsRes.data || [])
            .map((f) => f.friend_id || f.id)
            .filter(Boolean);
          if (ids.length) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, display_name, handle, avatar_url, flag")
              .in("id", ids);
            setFriends(profiles || []);
          } else {
            setFriends([]);
          }
          setAllUsers(usersRes.data || []);
        } catch {
          /* non critique */
        }
      } catch (e) {
        console.error("[community] loadAll", e);
        setError(e.message || "Erreur chargement communauté");
        setGroups([]);
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /** Groupe + membre owner + canal #general (atomique côté serveur) */
  const createGroup = useCallback(
    async ({ name, description, is_public = true, category = "community" }) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      const { data, error: err } = await supabase.rpc("create_community_group", {
        p_name: name,
        p_description: description || null,
        p_is_public: !!is_public,
        p_category: category || "community",
      });
      if (err) throw err;
      await loadAll(true);
      return data;
    },
    [id, loadAll]
  );

  /** Le nom est nettoyé côté serveur */
  const createChannel = useCallback(
    async (groupId, payload = {}) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      if (!groupId) throw new Error("Groupe requis");
      const { data, error: err } = await supabase.rpc(
        "create_community_channel",
        {
          p_group_id: groupId,
          p_name: payload.name || "",
          p_type: payload.type === "voice" ? "voice" : "text",
          p_description: payload.description || null,
        }
      );
      if (err) throw err;
      await loadAll(true);
      return data;
    },
    [id, loadAll]
  );

  /** code = code d'invitation (obligatoire pour un groupe privé) */
  const joinGroup = useCallback(
    async (groupId, code = null) => {
      if (!isValidAuthUserId(id) || !groupId) throw new Error("Non connecté");
      const { error: err } = await supabase.rpc("join_community_group", {
        p_group: groupId,
        p_code: code,
      });
      if (err) throw err;
      await loadAll(true);
    },
    [id, loadAll]
  );

  const leaveGroup = useCallback(
    async (groupId) => {
      if (!isValidAuthUserId(id) || !groupId) throw new Error("Non connecté");
      const { error: err } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", id);
      if (err) throw err;
      await loadAll(true);
    },
    [id, loadAll]
  );

  const banMember = useCallback(
    async (groupId, targetId, reason = null) => {
      if (!groupId || !isValidAuthUserId(targetId)) return;
      const { error: err } = await supabase.rpc("ban_community_member", {
        p_group: groupId,
        p_user: targetId,
        p_reason: reason,
      });
      if (err) throw err;
      await loadAll(true);
    },
    [loadAll]
  );

  const setMemberRole = useCallback(
    async (groupId, targetId, role) => {
      const { error: err } = await supabase.rpc("set_member_role", {
        p_group: groupId,
        p_user: targetId,
        p_role: role,
      });
      if (err) throw err;
      await loadAll(true);
    },
    [loadAll]
  );

  const loadUsers = useCallback(async (search = "") => {
    let q = supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, flag")
      .limit(30);
    if (search.trim()) {
      q = q.ilike("display_name", `%${search.trim().slice(0, 30)}%`);
    }
    const { data } = await q;
    setAllUsers(data || []);
    return data;
  }, []);

  return {
    id,
    friends,
    allUsers,
    groups,
    loading,
    error,
    loadAll,
    createGroup,
    createChannel,
    joinGroup,
    leaveGroup,
    banMember,
    setMemberRole,
    loadUsers,
  };
}

export function useChannelMessages(channelId) {
  const { id } = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const profilesRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Cache des profils (channel_messages.sender_id pointe vers auth.users,
  // donc pas de jointure directe avec profiles)
  const ensureProfiles = useCallback(async (list) => {
    const missing = [...new Set(list.map((m) => m.sender_id))].filter(
      (uid) => uid && !(uid in profilesRef.current)
    );
    if (!missing.length) return;
    missing.forEach((uid) => {
      profilesRef.current[uid] = null;
    });
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .in("id", missing);
    if (error) {
      missing.forEach((uid) => delete profilesRef.current[uid]);
      return;
    }
    (data || []).forEach((p) => {
      profilesRef.current[p.id] = p;
    });
    setProfilesById({ ...profilesRef.current });
  }, []);

  useEffect(() => {
    setRows([]);
    setHasMore(false);
    if (!channelId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    // On s'abonne d'abord, puis on charge : aucun message perdu entre les deux
    const realtime = supabase
      .channel(`channel-msgs-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "channel_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (cancelled) return;
          ensureProfiles([payload.new]);
          setRows((prev) => mergeMessages(prev, [payload.new]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channel_messages" },
        (payload) => {
          const gone = payload.old?.id;
          if (gone) setRows((prev) => prev.filter((m) => m.id !== gone));
        }
      )
      .subscribe();

    (async () => {
      const { data, error } = await supabase
        .from("channel_messages")
        .select(MSG_COLUMNS)
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (!error) {
        const list = data || [];
        setHasMore(list.length === PAGE_SIZE);
        setRows((prev) => mergeMessages(prev, list));
        ensureProfiles(list);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      supabase.removeChannel(realtime);
    };
  }, [channelId, ensureProfiles]);

  /** Charge les 50 messages précédents (pagination par curseur) */
  const loadOlder = useCallback(async () => {
    if (!channelId || !hasMore || loadingOlder || rows.length === 0) return;
    setLoadingOlder(true);
    const { data, error } = await supabase
      .from("channel_messages")
      .select(MSG_COLUMNS)
      .eq("channel_id", channelId)
      .lt("created_at", rows[0].created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!error) {
      const list = data || [];
      setHasMore(list.length === PAGE_SIZE);
      setRows((prev) => mergeMessages(prev, list));
      ensureProfiles(list);
    }
    setLoadingOlder(false);
  }, [channelId, hasMore, loadingOlder, rows, ensureProfiles]);

  const sendMessage = useCallback(
    async (text) => {
      if (!isValidAuthUserId(id) || !channelId) {
        throw new Error("Non connecté ou canal manquant");
      }
      const body = (text || "").trim();
      if (!body) return;
      const { data, error } = await supabase
        .from("channel_messages")
        .insert({
          channel_id: channelId,
          sender_id: id,
          text: body.slice(0, 2000),
        })
        .select(MSG_COLUMNS)
        .single();
      if (error) throw error;
      // Affichage immédiat ; le doublon realtime est ignoré (même id)
      if (data) {
        ensureProfiles([data]);
        setRows((prev) => mergeMessages(prev, [data]));
      }
    },
    [id, channelId, ensureProfiles]
  );

  /** Auteur ou modérateur (la base refuse les autres cas) */
  const deleteMessage = useCallback(async (messageId) => {
    const { data, error } = await supabase
      .from("channel_messages")
      .delete()
      .eq("id", messageId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Suppression refusée");
    setRows((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const reportMessage = useCallback(async (messageId, reason = null) => {
    const { error } = await supabase.rpc("report_community_message", {
      p_message: messageId,
      p_reason: reason,
    });
    if (error) throw error;
  }, []);

  // Même forme qu'avant : chaque message porte son profil dans m.profiles
  const messages = useMemo(
    () =>
      rows.map((m) => ({
        ...m,
        profiles: profilesById[m.sender_id] || null,
      })),
    [rows, profilesById]
  );

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    sendMessage,
    deleteMessage,
    reportMessage,
    id,
  };
}
