import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient.js";

const PAGE_SIZE = 50;
const MSG_COLUMNS = "id, channel_id, sender_id, text, created_at";
const PROFILE_COLUMNS = "id, display_name, handle, avatar_url";

/** auth.users.id (UUID) */
export function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

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

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        console.error("[auth] getSession", error);
        setId(null);
      } else {
        setId(data?.session?.user?.id || null);
      }
      setLoadingUser(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setId(session?.user?.id || null);
      setLoadingUser(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { id, loadingUser };
}

/**
 * Communauté style Telegram :
 * groupes, canaux (text / voice / announce), invites, rôles.
 */
export function useCommunity(externalId) {
  const id = externalId;

  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(
    async (silent = false) => {
      if (!isValidAuthUserId(id)) {
        setGroups([]);
        setFriends([]);
        setAllUsers([]);
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      setError(null);

      try {
        const { data, error: gError } = await supabase
          .from("groups")
          .select(
            `
            id,
            name,
            description,
            avatar_url,
            owner_id,
            created_at,
            is_public,
            category,
            channels (
              id,
              group_id,
              name,
              type,
              description,
              topic,
              created_at
            ),
            group_members (
              group_id,
              user_id,
              role,
              joined_at
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(50);

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
            channels: (g.channels || []).slice().sort((a, b) => {
              if (a.name === "general") return -1;
              if (b.name === "general") return 1;
              return (a.name || "").localeCompare(b.name || "");
            }),
          }))
        );

        try {
          const [friendsRes, usersRes] = await Promise.all([
            supabase.rpc("get_user_friends", { user_id: id }).catch(() => ({ data: null })),
            supabase
              .from("profiles")
              .select("id, display_name, handle, avatar_url, flag")
              .limit(30),
          ]);

          const ids = (friendsRes?.data || [])
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

          setAllUsers(usersRes?.data || []);
        } catch (friendError) {
          console.warn("[community] amis non bloquant", friendError);
        }
      } catch (e) {
        console.error("[community] loadAll", e);
        setError(e?.message || "Erreur chargement communauté");
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

  const myRole = useCallback(
    (group) => {
      if (!id || !group) return null;
      if (group.owner_id === id) return "owner";
      const m = (group.members || []).find((x) => x.user_id === id);
      return m?.role || null;
    },
    [id]
  );

  const isMember = useCallback((group) => !!myRole(group), [myRole]);

  const isAdmin = useCallback((group) => {
    const r = myRole(group);
    return r === "owner" || r === "admin";
  }, [myRole]);

  const canPostInChannel = useCallback(
    (group, channel) => {
      const role = myRole(group);
      if (!role || !channel) return false;
      if (channel.type === "announce") {
        return ["owner", "admin", "moderator"].includes(role);
      }
      return true;
    },
    [myRole]
  );

  const createGroup = useCallback(
    async ({ name, description, is_public = true, category = "community" }) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session?.user?.id) {
        throw new Error("Session Supabase absente");
      }
      if (sessionData.session.user.id !== id) {
        throw new Error("Session utilisateur incohérente. Reconnecte-toi.");
      }

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

  const createChannel = useCallback(
    async (groupId, payload = {}) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      if (!groupId) throw new Error("Groupe requis");

      let pType = "text";
      if (payload.type === "voice") pType = "voice";
      else if (payload.type === "announce") pType = "announce";

      const { data, error: err } = await supabase.rpc("create_community_channel", {
        p_group_id: groupId,
        p_name: payload.name || "",
        p_type: pType,
        p_description: payload.description || null,
      });

      if (err) throw err;
      await loadAll(true);
      return data;
    },
    [id, loadAll]
  );

  /**
   * Rejoindre : groupId seul (public) OU code seul (invite) OU les deux.
   */
  const joinGroup = useCallback(
    async (groupId = null, code = null) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");

      const { data, error: err } = await supabase.rpc("join_community_group", {
        p_group: groupId || null,
        p_code: code ? String(code).trim() : null,
      });

      if (err) throw err;
      await loadAll(true);
      return data;
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

  const createInvite = useCallback(
    async (groupId, { maxUses = 0, expiresHours = null } = {}) => {
      if (!isValidAuthUserId(id) || !groupId) throw new Error("Non connecté");
      const { data, error: err } = await supabase.rpc("create_group_invite", {
        p_group: groupId,
        p_max_uses: maxUses,
        p_expires_hours: expiresHours,
      });
      if (err) throw err;
      return data;
    },
    [id]
  );

  const listInvites = useCallback(async (groupId) => {
    const { data, error: err } = await supabase.rpc("list_group_invites", {
      p_group: groupId,
    });
    if (err) throw err;
    return data || [];
  }, []);

  const revokeInvite = useCallback(async (inviteId) => {
    const { error: err } = await supabase.rpc("revoke_group_invite", {
      p_invite_id: inviteId,
    });
    if (err) throw err;
  }, []);

  const peekInvite = useCallback(async (code) => {
    const { data, error: err } = await supabase.rpc("peek_group_invite", {
      p_code: String(code).trim(),
    });
    if (err) throw err;
    return data;
  }, []);

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
    myRole,
    isMember,
    isAdmin,
    canPostInChannel,
    createGroup,
    createChannel,
    joinGroup,
    leaveGroup,
    banMember,
    setMemberRole,
    createInvite,
    listInvites,
    revokeInvite,
    peekInvite,
    loadUsers,
  };
}

/**
 * Messages d'un canal + realtime.
 */
export function useChannelMessages(channelId) {
  const { id } = useCurrentUser();

  const [rows, setRows] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const profilesRef = useRef({});

  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const ensureProfiles = useCallback(async (list) => {
    const missing = [
      ...new Set(list.map((m) => m.sender_id)),
    ].filter((uid) => uid && !(uid in profilesRef.current));

    if (!missing.length) return;

    missing.forEach((uid) => {
      profilesRef.current[uid] = null;
    });

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .in("id", missing);

    if (error) {
      missing.forEach((uid) => {
        delete profilesRef.current[uid];
      });
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
        {
          event: "DELETE",
          schema: "public",
          table: "channel_messages",
        },
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

      if (data) {
        ensureProfiles([data]);
        setRows((prev) => mergeMessages(prev, [data]));
      }
    },
    [id, channelId, ensureProfiles]
  );

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
