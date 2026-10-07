import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";

const PROFILE_SELECT =
  "id, display_name, handle, flag, bio, avatar_url, cover_url, first_name, last_name, birth_date, location, country, updated_at, created_at";

/**
 * user_id = auth.users.id (UUID) uniquement.
 * Rejette email, handle (@xxx) et toute valeur non-UUID.
 */
function assert_user_id(user_id) {
  if (!user_id || typeof user_id !== "string") return false;
  if (user_id.startsWith("@") || (user_id.includes("@") && user_id.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id);
}

export function useProfile(user_id, showToast) {
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState({ phones: [], emails: [] });
  const [links, setLinks] = useState([]);
  const [socials, setSocials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!assert_user_id(user_id)) {
      setProfile(null);
      setContacts({ phones: [], emails: [] });
      setLinks([]);
      setSocials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // profiles.id = auth.users.id
      let profileRes = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user_id)
        .maybeSingle();

      // FK user_id des tables satellites = auth.users.id
      const [contactsRes, linksRes, socialsRes] = await Promise.all([
        supabase
          .from("profile_contacts")
          .select("id,contact_type,value,label,position,is_primary")
          .eq("user_id", user_id)
          .order("position"),
        supabase
          .from("profile_links")
          .select("id,link_type,label,url,position")
          .eq("user_id", user_id)
          .order("position"),
        supabase
          .from("profile_social_links")
          .select("id,platform,username,url,position")
          .eq("user_id", user_id)
          .order("platform"),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (contactsRes.error && contactsRes.error.code !== "42P01") throw contactsRes.error;
      if (linksRes.error && linksRes.error.code !== "42P01") throw linksRes.error;
      if (socialsRes.error && socialsRes.error.code !== "42P01") throw socialsRes.error;

      let profileData = profileRes.data;
      if (!profileData) {
        const fallback = {
          id: user_id, // = auth.users.id
          display_name: "Nouveau membre",
          handle: null, // handle ≠ identité
          flag: "🌍",
          bio: "",
          avatar_url: null,
          cover_url: null,
          updated_at: new Date().toISOString(),
        };
        const { data: created, error: createErr } = await supabase
          .from("profiles")
          .upsert(fallback, { onConflict: "id" })
          .select(PROFILE_SELECT)
          .single();
        if (createErr) {
          console.error("[BAARO] Création profil échouée:", createErr);
        } else {
          profileData = created;
        }
      }

      setProfile(
        profileData || {
          id: user_id,
          display_name: "Nouveau membre",
          handle: null,
          flag: "🌍",
          bio: "",
          avatar_url: null,
          cover_url: null,
        }
      );

      const allContacts = contactsRes.data || [];
      setContacts({
        phones: allContacts.filter((x) => x.contact_type === "phone"),
        emails: allContacts.filter((x) => x.contact_type === "email"),
      });
      setLinks(linksRes.data || []);
      setSocials(socialsRes.data || []);
    } catch (error) {
      handleDbError(error, showToast, "Erreur chargement profil");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user_id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = useCallback(
    async (updates) => {
      if (!assert_user_id(user_id)) return { ok: false };
      setSaving(true);
      try {
        // Seuls les champs fournis sont modifiés : jamais d'écrasement par null
        const payload = { updated_at: new Date().toISOString() };
        const has = (k) => Object.prototype.hasOwnProperty.call(updates, k);
        if (has("display_name")) payload.display_name = updates.display_name?.trim() || "Nouveau membre";
        if (has("handle")) {
          const h = updates.handle?.trim();
          if (h && h !== "@membre") payload.handle = h;
        }
        if (has("flag")) payload.flag = updates.flag || "🌍";
        if (has("bio")) payload.bio = updates.bio?.trim() || "";
        if (has("avatar_url")) payload.avatar_url = updates.avatar_url ?? null;
        if (has("cover_url")) payload.cover_url = updates.cover_url ?? null;
        if (has("first_name")) payload.first_name = updates.first_name?.trim() || null;
        if (has("last_name")) payload.last_name = updates.last_name?.trim() || null;
        if (has("birth_date")) payload.birth_date = updates.birth_date || null;
        if (has("location")) payload.location = updates.location?.trim() || null;
        if (has("country")) payload.country = updates.country || null;

        const { data, error } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", user_id)
          .select(PROFILE_SELECT)
          .single();

        if (error) throw error;
        setProfile(data);
        showToast?.("Profil mis à jour", "success");
        return { ok: true, data };
      } catch (error) {
        handleDbError(error, showToast, "Impossible de sauvegarder le profil");
        return { ok: false };
      } finally {
        setSaving(false);
      }
    },
    [user_id, showToast]
  );

  return {
    profile,
    contacts,
    links,
    socials,
    loading,
    saving,
    updateProfile,
    reload: load,
  };
}

export function useProfileStats(user_id) {
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    friends: 0,
    posts: 0,
    likes: 0,
  });

  useEffect(() => {
    if (!assert_user_id(user_id)) {
      setStats({ followers: 0, following: 0, friends: 0, posts: 0, likes: 0 });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_profile_stats", { p_user_id: user_id });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setStats({ followers: Number(row?.followers || 0), following: Number(row?.following || 0), friends: Number(row?.friends || 0), posts: Number(row?.posts || 0), likes: Number(row?.likes || 0) });
      } catch {
        try {
          const [fol, wing, friends, posts, postRows] = await Promise.all([
            supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", user_id).eq("status", "accepted"),
            supabase.from("follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", user_id).eq("status", "accepted"),
            supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", user_id).eq("status", "accepted").eq("is_friend", true),
            supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user_id),
            supabase.from("posts").select("id").eq("author_id", user_id),
          ]);
          const ids = (postRows.data || []).map((x) => x.id);
          let likesCount = 0;
          if (ids.length) { const r = await supabase.from("post_likes").select("post_id", { count: "exact", head: true }).in("post_id", ids); likesCount = r.count || 0; }
          setStats({ followers: fol.count || 0, following: wing.count || 0, friends: friends.count || 0, posts: posts.count || 0, likes: likesCount });
        } catch {}
      }
    })();
  }, [user_id]);

  return stats;
}
