// ... imports et helpers existants (isValidAuthUserId, mergeMessages, useCurrentUser) ...

export function useCommunity(externalId) {
  const id = externalId;
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!isValidAuthUserId(id)) {
      setGroups([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: gError } = await supabase
        .from("groups")
        .select(`
          id, name, description, avatar_url, owner_id, created_at, is_public, category,
          channels ( id, group_id, name, type, description, topic, created_at ),
          group_members ( group_id, user_id, role, joined_at )
        `)
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
    } catch (e) {
      console.error("[community] loadAll", e);
      setError(e?.message || "Erreur chargement communauté");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const myRole = useCallback(
    (group) => {
      if (!id || !group) return null;
      if (group.owner_id === id) return "owner";
      const m = (group.members || []).find((x) => x.user_id === id);
      return m?.role || null;
    },
    [id]
  );

  const isMember = useCallback(
    (group) => !!myRole(group),
    [myRole]
  );

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

  const createChannel = useCallback(
    async (groupId, payload = {}) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      const { data, error: err } = await supabase.rpc("create_community_channel", {
        p_group_id: groupId,
        p_name: payload.name || "",
        p_type: payload.type === "voice" ? "voice" : payload.type === "announce" ? "announce" : "text",
        p_description: payload.description || null,
      });
      if (err) throw err;
      await loadAll(true);
      return data;
    },
    [id, loadAll]
  );

  const joinGroup = useCallback(
    async (groupId = null, code = null) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      const { data, error: err } = await supabase.rpc("join_community_group", {
        p_group: groupId,
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

  const createInvite = useCallback(
    async (groupId, { maxUses = 0, expiresHours = null } = {}) => {
      const { data, error: err } = await supabase.rpc("create_group_invite", {
        p_group: groupId,
        p_max_uses: maxUses,
        p_expires_hours: expiresHours,
      });
      if (err) throw err;
      return data;
    },
    []
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

  return {
    id,
    groups,
    loading,
    error,
    loadAll,
    myRole,
    isMember,
    createGroup,
    createChannel,
    joinGroup,
    leaveGroup,
    createInvite,
    listInvites,
    revokeInvite,
    peekInvite,
  };
}

// garder useChannelMessages existant (messages, sendMessage, etc.)
