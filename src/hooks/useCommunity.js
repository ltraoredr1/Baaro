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

/** Fusionne deux listes de messages sans doublon et les trie */
function mergeMessages(a, b) {
  const map = new Map();

  for (const m of a) {
    map.set(m.id, m);
  }

  for (const m of b) {
    map.set(m.id, { ...map.get(m.id), ...m });
  }

  return [...map.values()].sort(
    (x, y) => new Date(x.created_at) - new Date(y.created_at)
  );
}

/**
 * Utilisateur actuellement authentifié.
 */
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
 * Communauté :
 * groupes, canaux, membres et modération.
 *
 * Les écritures sensibles passent par les RPC Supabase.
 *
 * IMPORTANT :
 * l'identifiant utilisateur est fourni par le composant appelant.
 * Cela évite de créer une deuxième instance de useCurrentUser()
 * dans le même composant.
 */
export function useCommunity(externalId) {
  const id = externalId;

  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Recharge les groupes et utilisateurs.
  const loadAll = useCallback(
    async (silent = false) => {
      if (!isValidAuthUserId(id)) {
        setGroups([]);
        setFriends([]);
        setAllUsers([]);
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }

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
          .limit(40);

        if (gError) {
          throw gError;
        }

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

        // Amis / utilisateurs : non bloquant.
        try {
          const [friendsRes, usersRes] = await Promise.all([
            supabase.rpc("get_user_friends", {
              user_id: id,
            }),

            supabase
              .from("profiles")
              .select(
                "id, display_name, handle, avatar_url, flag"
              )
              .limit(30),
          ]);

          const ids = (friendsRes.data || [])
            .map((f) => f.friend_id || f.id)
            .filter(Boolean);

          if (ids.length) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select(
                "id, display_name, handle, avatar_url, flag"
              )
              .in("id", ids);

            setFriends(profiles || []);
          } else {
            setFriends([]);
          }

          setAllUsers(usersRes.data || []);
        } catch (friendError) {
          console.warn(
            "[community] chargement amis/utilisateurs non bloquant",
            friendError
          );
        }
      } catch (e) {
        console.error("[community] loadAll", e);

        setError(
          e?.message || "Erreur chargement communauté"
        );

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

  /**
   * Création atomique :
   * groupe + propriétaire + canal #general.
   *
   * La création est effectuée par le RPC SECURITY DEFINER
   * create_community_group().
   */
  const createGroup = useCallback(
    async ({
      name,
      description,
      is_public = true,
      category = "community",
    }) => {
      if (!isValidAuthUserId(id)) {
        throw new Error("Non connecté");
      }

      /*
       * Diagnostic de session.
       *
       * IMPORTANT :
       * on ne log jamais le access_token.
       */
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log("[community:create] auth", {
        hookId: id,
        sessionUserId: sessionData?.session?.user?.id || null,
        hasToken: !!sessionData?.session?.access_token,
        sessionError: sessionError?.message || null,
      });

      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData?.session?.user?.id) {
        throw new Error("Session Supabase absente");
      }

      /*
       * Vérification supplémentaire :
       * l'identité du hook doit correspondre à celle
       * de la session réellement utilisée par Supabase.
       */
      if (sessionData.session.user.id !== id) {
        console.error("[community:create] identité incohérente", {
          hookId: id,
          sessionUserId: sessionData.session.user.id,
        });

        throw new Error(
          "Session utilisateur incohérente. Reconnecte-toi."
        );
      }

      const { data, error: err } = await supabase.rpc(
        "create_community_group",
        {
          p_name: name,
          p_description: description || null,
          p_is_public: !!is_public,
          p_category: category || "community",
        }
      );

      console.log("[community:create] rpc", {
        data,
        code: err?.code || null,
        message: err?.message || null,
        details: err?.details || null,
        hint: err?.hint || null,
      });

      if (err) {
        throw err;
      }

      await loadAll(true);

      return data;
    },
    [id, loadAll]
  );

  /**
   * Création d'un canal.
   */
  const createChannel = useCallback(
    async (groupId, payload = {}) => {
      if (!isValidAuthUserId(id)) {
        throw new Error("Non connecté");
      }

      if (!groupId) {
        throw new Error("Groupe requis");
      }

      const { data, error: err } = await supabase.rpc(
        "create_community_channel",
        {
          p_group_id: groupId,
          p_name: payload.name || "",
          p_type:
            payload.type === "voice"
              ? "voice"
              : "text",
          p_description:
            payload.description || null,
        }
      );

      if (err) {
        throw err;
      }

      await loadAll(true);

      return data;
    },
    [id, loadAll]
  );

  /**
   * Rejoindre un groupe.
   * Un code est nécessaire pour un groupe privé.
   */
  const joinGroup = useCallback(
    async (groupId, code = null) => {
      if (!isValidAuthUserId(id) || !groupId) {
        throw new Error("Non connecté");
      }

      const { error: err } = await supabase.rpc(
        "join_community_group",
        {
          p_group: groupId,
          p_code: code,
        }
      );

      if (err) {
        throw err;
      }

      await loadAll(true);
    },
    [id, loadAll]
  );

  /**
   * Quitter un groupe.
   */
  const leaveGroup = useCallback(
    async (groupId) => {
      if (!isValidAuthUserId(id) || !groupId) {
        throw new Error("Non connecté");
      }

      const { error: err } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", id);

      if (err) {
        throw err;
      }

      await loadAll(true);
    },
    [id, loadAll]
  );

  /**
   * Bannir un membre.
   */
  const banMember = useCallback(
    async (groupId, targetId, reason = null) => {
      if (!groupId || !isValidAuthUserId(targetId)) {
        return;
      }

      const { error: err } = await supabase.rpc(
        "ban_community_member",
        {
          p_group: groupId,
          p_user: targetId,
          p_reason: reason,
        }
      );

      if (err) {
        throw err;
      }

      await loadAll(true);
    },
    [loadAll]
  );

  /**
   * Modifier le rôle d'un membre.
   */
  const setMemberRole = useCallback(
    async (groupId, targetId, role) => {
      const { error: err } = await supabase.rpc(
        "set_member_role",
        {
          p_group: groupId,
          p_user: targetId,
          p_role: role,
        }
      );

      if (err) {
        throw err;
      }

      await loadAll(true);
    },
    [loadAll]
  );

  /**
   * Recherche d'utilisateurs.
   */
  const loadUsers = useCallback(async (search = "") => {
    let q = supabase
      .from("profiles")
      .select(
        "id, display_name, handle, avatar_url, flag"
      )
      .limit(30);

    if (search.trim()) {
      q = q.ilike(
        "display_name",
        `%${search.trim().slice(0, 30)}%`
      );
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

/**
 * Messages d'un canal.
 */
export function useChannelMessages(channelId) {
  const { id } = useCurrentUser();

  const [rows, setRows] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const profilesRef = useRef({});

  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Charge les profils nécessaires aux messages.
   */
  const ensureProfiles = useCallback(async (list) => {
    const missing = [
      ...new Set(
        list.map((m) => m.sender_id)
      ),
    ].filter(
      (uid) =>
        uid &&
        !(uid in profilesRef.current)
    );

    if (!missing.length) {
      return;
    }

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

    setProfilesById({
      ...profilesRef.current,
    });
  }, []);

  /**
   * Chargement + realtime des messages.
   */
  useEffect(() => {
    setRows([]);
    setHasMore(false);

    if (!channelId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);

    /*
     * On s'abonne d'abord, puis on charge les messages.
     * Cela évite de perdre un message entre les deux opérations.
     */
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
          if (cancelled) {
            return;
          }

          ensureProfiles([payload.new]);

          setRows((prev) =>
            mergeMessages(prev, [payload.new])
          );
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

          if (gone) {
            setRows((prev) =>
              prev.filter((m) => m.id !== gone)
            );
          }
        }
      )
      .subscribe();

    (async () => {
      const { data, error } = await supabase
        .from("channel_messages")
        .select(MSG_COLUMNS)
        .eq("channel_id", channelId)
        .order("created_at", {
          ascending: false,
        })
        .limit(PAGE_SIZE);

      if (cancelled) {
        return;
      }

      if (!error) {
        const list = data || [];

        setHasMore(
          list.length === PAGE_SIZE
        );

        setRows((prev) =>
          mergeMessages(prev, list)
        );

        ensureProfiles(list);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      supabase.removeChannel(realtime);
    };
  }, [channelId, ensureProfiles]);

  /**
   * Charge les messages précédents.
   */
  const loadOlder = useCallback(async () => {
    if (
      !channelId ||
      !hasMore ||
      loadingOlder ||
      rows.length === 0
    ) {
      return;
    }

    setLoadingOlder(true);

    const { data, error } = await supabase
      .from("channel_messages")
      .select(MSG_COLUMNS)
      .eq("channel_id", channelId)
      .lt("created_at", rows[0].created_at)
      .order("created_at", {
        ascending: false,
      })
      .limit(PAGE_SIZE);

    if (!error) {
      const list = data || [];

      setHasMore(
        list.length === PAGE_SIZE
      );

      setRows((prev) =>
        mergeMessages(prev, list)
      );

      ensureProfiles(list);
    }

    setLoadingOlder(false);
  }, [
    channelId,
    hasMore,
    loadingOlder,
    rows,
    ensureProfiles,
  ]);

  /**
   * Envoie un message.
   */
  const sendMessage = useCallback(
    async (text) => {
      if (
        !isValidAuthUserId(id) ||
        !channelId
      ) {
        throw new Error(
          "Non connecté ou canal manquant"
        );
      }

      const body = (text || "").trim();

      if (!body) {
        return;
      }

      const { data, error } = await supabase
        .from("channel_messages")
        .insert({
          channel_id: channelId,
          sender_id: id,
          text: body.slice(0, 2000),
        })
        .select(MSG_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      // Affichage immédiat.
      // Le doublon realtime sera ignoré grâce à l'id.
      if (data) {
        ensureProfiles([data]);

        setRows((prev) =>
          mergeMessages(prev, [data])
        );
      }
    },
    [
      id,
      channelId,
      ensureProfiles,
    ]
  );

  /**
   * Supprime un message.
   * La base vérifie les droits auteur/modérateur.
   */
  const deleteMessage = useCallback(
    async (messageId) => {
      const { data, error } = await supabase
        .from("channel_messages")
        .delete()
        .eq("id", messageId)
        .select("id");

      if (error) {
        throw error;
      }

      if (!data?.length) {
        throw new Error(
          "Suppression refusée"
        );
      }

      setRows((prev) =>
        prev.filter((m) => m.id !== messageId)
      );
    },
    []
  );

  /**
   * Signale un message.
   */
  const reportMessage = useCallback(
    async (messageId, reason = null) => {
      const { error } = await supabase.rpc(
        "report_community_message",
        {
          p_message: messageId,
          p_reason: reason,
        }
      );

      if (error) {
        throw error;
      }
    },
    []
  );

  /**
   * Même structure qu'avant :
   * chaque message contient son profil.
   */
  const messages = useMemo(
    () =>
      rows.map((m) => ({
        ...m,
        profiles:
          profilesById[m.sender_id] || null,
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
