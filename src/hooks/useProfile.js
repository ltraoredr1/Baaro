import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";

const PROFILE_SELECT =
  "id, display_name, handle, flag, bio, avatar_url, cover_url, first_name, last_name, birth_date, location, country, updated_at, created_at";

/**
 * userId = auth.users.id (UUID) uniquement.
 * Rejette email, handle (@xxx) et toute valeur non-UUID.
 */
function assertUserId(userId) {
  if (!userId || typeof userId !== "string") return false;
  if (userId.startsWith("@") || (userId.includes("@") && userId.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
}

export function useProfile(userId, showToast) {
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState({ phones: [], emails: [] });
  const [links, setLinks] = useState([]);
  const [socials, setSocials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!assertUserId(userId)) {
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
        .eq("id", userId)
        .maybeSingle();

      // FK user_id des tables satellites = auth.users.id
      const [contactsRes, linksRes, socialsRes] = await Promise.all([
        supabase
          .from("profile_contacts")
          .select("id,contact_type,value,label,position,is_primary")
          .eq("user_id", userId)
          .order("position"),
        supabase
          .from("profile_links")
          .select("id,link_type,label,url,position")
          .eq("user_id", userId)
          .order("position"),
        supabase
          .from("profile_social_links")
          .select("id,platform,username,url,position")
          .eq("user_id", userId)
          .order("platform"),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (contactsRes.error && contactsRes.error.code !== "42P01") throw contactsRes.error;
      if (linksRes.error && linksRes.error.code !== "42P01") throw linksRes.error;
      if (socialsRes.error && socialsRes.error.code !== "42P01") throw socialsRes.error;

      let profileData = profileRes.data;
      if (!profileData) {
        const fallback = {
          id: userId, // = auth.users.id
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
          id: userId,
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
  }, [userId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = useCallback(
    async (updates) => {
      if (!assertUserId(userId)) return { ok: false };
      setSaving(true);
      try {
        // Clé primaire = auth.users.id — handle/bio ne sont que des attributs
        const payload = {
          id: userId,
          display_name: updates.display_name?.trim() || "Nouveau membre",
          handle:
            updates.handle?.trim() && updates.handle.trim() !== "@membre"
              ? updates.handle.trim()
              : null,
          flag: updates.flag || "🌍",
          bio: updates.bio?.trim() || "",
          avatar_url: updates.avatar_url ?? null,
          cover_url: updates.cover_url ?? null,
          first_name: updates.first_name?.trim() || null,
          last_name: updates.last_name?.trim() || null,
          birth_date: updates.birth_date || null,
          location: updates.location?.trim() || null,
          country: updates.country || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("profiles")
          .upsert(payload, { onConflict: "id" })
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
    [userId, showToast]
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

export function useProfileStats(userId) {
  const [stats, setStats] = useState({
    followers: 0,
    following: 0,
    posts: 0,
  });

  useEffect(() => {
    if (!assertUserId(userId)) {
      setStats({ followers: 0, following: 0, posts: 0 });
      return;
    }
    (async () => {
      try {
        // follower_id / followed_id = FK vers auth.users.id
        const [fol, wing, posts] = await Promise.all([
          supabase
            .from("follows")
            .select("follower_id", { count: "exact", head: true })
            .eq("followed_id", userId),
          supabase
            .from("follows")
            .select("followed_id", { count: "exact", head: true })
            .eq("follower_id", userId),
          supabase
            .from("posts")
            .select("id", { count: "exact", head: true })
            .eq("author_id", userId),
        ]);
        setStats({
          followers: fol.count || 0,
          following: wing.count || 0,
          posts: posts.count || 0,
        });
      } catch {
        /* ignore */
      }
    })();
  }, [userId]);

  return stats;
}
