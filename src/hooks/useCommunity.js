import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient.js";

/** auth.users.id (UUID) */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function useCurrentUser() {
  const [id, setId] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setId(data?.user?.id || null);
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
 * Communauté : groupes, canaux, création.
 * Schéma souple : is_public OU is_private, category optionnelle.
 */
export function useCommunity(externalId) {
  const { id: authId } = useCurrentUser();
  const id = externalId || authId;
  const [groups, setGroups] = useState([]);
  const [friends, setFriends] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!isValidAuthUserId(id)) {
      setGroups([]);
      setFriends([]);
      setAllUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1) Groupes (requête large, colonnes optionnelles)
      let groupsData = null;
      let gError = null;

      const full = await supabase
        .from("groups")
        .select(
          `
          id, name, description, avatar_url, owner_id, created_at,
          is_public, is_private, category,
          channels (id, group_id, name, type, description, topic, created_at),
          group_members (group_id, user_id, role, joined_at)
        `
        )
        .order("created_at", { ascending: false })
        .limit(40);

      if (full.error) {
        // Fallback minimal (colonnes de base uniquement)
        const minimal = await supabase
          .from("groups")
          .select(
            `
            id, name, description, avatar_url, owner_id, created_at,
            channels (id, group_id, name, type, description, created_at),
            group_members (group_id, user_id, role, joined_at)
          `
          )
          .order("created_at", { ascending: false })
          .limit(40);
        groupsData = minimal.data;
        gError = minimal.error;
      } else {
        groupsData = full.data;
      }

      if (gError) throw gError;

      const enriched = (groupsData || []).map((g) => {
        const isPublic =
          g.is_public === true ||
          (g.is_private === false) ||
          (g.is_public == null && g.is_private == null);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          avatar_url: g.avatar_url,
          owner_id: g.owner_id,
          created_at: g.created_at,
          category: g.category || "community",
          is_public: isPublic,
          members: g.group_members || [],
          channels: g.channels || [],
        };
      });

      setGroups(enriched);

      // 2) Amis / users (non bloquant)
      try {
        const [{ data: friendIds }, { data: users }] = await Promise.all([
          supabase.rpc("get_user_friends", { user_id: id }).catch(() => ({
            data: null,
          })),
          supabase
            .from("profiles")
            .select("id, display_name, handle, avatar_url, flag")
            .limit(30),
        ]);
        if (friendIds?.length) {
          const ids = friendIds
            .map((f) => f.friend_id || f.id)
            .filter(Boolean);
          if (ids.length) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, display_name, handle, avatar_url, flag")
              .in("id", ids);
            setFriends(profiles || []);
          }
        }
        setAllUsers(users || []);
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
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /**
   * Créer un groupe + membership owner + canal #général
   */
  const createGroup = useCallback(
    async ({ name, description, is_public = true, category = "community" }) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      const trimmed = (name || "").trim();
      if (trimmed.length < 2) throw new Error("Nom du groupe trop court (min 2)");

      // Payload compatible is_public / is_private
      const base = {
        name: trimmed.slice(0, 80),
        description: (description || "").trim().slice(0, 500) || null,
        owner_id: id,
      };

      let group = null;
      let error = null;

      // Essai avec is_public + category
      const try1 = await supabase
        .from("groups")
        .insert({
          ...base,
          is_public: !!is_public,
          category: category || "community",
        })
        .select()
        .single();

      if (try1.error) {
        // Essai is_private inverse
        const try2 = await supabase
          .from("groups")
          .insert({
            ...base,
            is_private: !is_public,
          })
          .select()
          .single();
        if (try2.error) {
          // Essai minimal
          const try3 = await supabase
            .from("groups")
            .insert(base)
            .select()
            .single();
          group = try3.data;
          error = try3.error;
        } else {
          group = try2.data;
        }
      } else {
        group = try1.data;
      }

      if (error) throw error;
      if (!group?.id) throw new Error("Groupe non créé");

      // Membre owner
      const { error: memErr } = await supabase.from("group_members").upsert(
        {
          group_id: group.id,
          user_id: id,
          role: "owner",
        },
        { onConflict: "group_id,user_id" }
      );
      if (memErr) {
        // ignore duplicate
        console.warn("[community] member", memErr.message);
      }

      // Canal #général
      const { error: chErr } = await supabase.from("channels").insert({
        group_id: group.id,
        name: "general",
        type: "text",
        description: "Canal principal",
      });
      if (chErr) console.warn("[community] channel default", chErr.message);

      await loadAll();
      return group;
    },
    [id, loadAll]
  );

  const createChannel = useCallback(
    async (groupId, payload = {}) => {
      if (!isValidAuthUserId(id)) throw new Error("Non connecté");
      if (!groupId) throw new Error("Groupe requis");
      const raw = (payload.name || "").trim();
      if (raw.length < 1) throw new Error("Nom du canal requis");
      const name = raw
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 40);
      if (!name) throw new Error("Nom de canal invalide");

      const row = {
        group_id: groupId,
        name,
        type: payload.type === "voice" ? "voice" : "text",
        description: (payload.description || "").trim().slice(0, 200) || null,
      };

      let data = null;
      let error = null;
      const withTopic = await supabase
        .from("channels")
        .insert({ ...row, topic: payload.topic || null })
        .select()
        .single();
      if (withTopic.error) {
        const basic = await supabase.from("channels").insert(row).select().single();
        data = basic.data;
        error = basic.error;
      } else {
        data = withTopic.data;
      }
      if (error) throw error;
      await loadAll();
      return data;
    },
    [id, loadAll]
  );

  const joinGroup = useCallback(
    async (groupId) => {
      if (!isValidAuthUserId(id) || !groupId) throw new Error("Non connecté");
      const { error } = await supabase.from("group_members").upsert(
        { group_id: groupId, user_id: id, role: "member" },
        { onConflict: "group_id,user_id" }
      );
      if (error) throw error;
      await loadAll();
    },
    [id, loadAll]
  );

  const leaveGroup = useCallback(
    async (groupId) => {
      if (!isValidAuthUserId(id) || !groupId) throw new Error("Non connecté");
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", id);
      if (error) throw error;
      await loadAll();
    },
    [id, loadAll]
  );

  const banMember = useCallback(
    async (groupId, targetId) => {
      if (!groupId || !isValidAuthUserId(targetId)) return;
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetId);
      if (error) throw error;
      await loadAll();
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
    loadUsers,
  };
}

export function useChannelMessages(channelId) {
  const { id } = useCurrentUser();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(channelId);
  useEffect(() => {
    channelRef.current = channelId;
  }, [channelId]);

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    let cancelled = false;

    const load = async () => {
      const withProfiles = await supabase
        .from("channel_messages")
        .select(
          "id, channel_id, sender_id, text, created_at, profiles:profiles!sender_id(id, display_name, handle, avatar_url)"
        )
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(80);

      if (withProfiles.error) {
        const basic = await supabase
          .from("channel_messages")
          .select("id, channel_id, sender_id, text, created_at")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: true })
          .limit(80);
        if (!cancelled) setMessages(basic.data || []);
      } else if (!cancelled) {
        setMessages(withProfiles.data || []);
      }
      if (!cancelled) setLoading(false);
    };
    load();

    const channel = supabase
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
          if (channelRef.current !== channelId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  const sendMessage = useCallback(
    async (text) => {
      if (!isValidAuthUserId(id) || !channelId) {
        throw new Error("Non connecté ou canal manquant");
      }
      const body = (text || "").trim();
      if (!body) return;
      const { error } = await supabase.from("channel_messages").insert({
        channel_id: channelId,
        sender_id: id,
        text: body.slice(0, 2000),
      });
      if (error) throw error;
    },
    [id, channelId]
  );

  return { messages, loading, sendMessage, id };
}
