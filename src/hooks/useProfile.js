import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";

const PROFILE_SELECT =
  "user_id, display_name, handle, flag, bio, avatar_url, created_at";

export function useProfile(userId, showToast) {
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState({ phones: [], emails: [] });
  const [links, setLinks] = useState([]);
  const [socials, setSocials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setContacts({ phones: [], emails: [] });
      setLinks([]);
      setSocials([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profileRes, contactsRes, linksRes, socialsRes] = await Promise.all([
        supabase.from("profiles").select(PROFILE_SELECT).eq("user_id", userId).maybeSingle(),
        supabase.from("profile_contacts").select("id,contact_type,value,label,position,is_primary").eq("user_id", userId).order("position"),
        supabase.from("profile_links").select("id,link_type,label,url,position").eq("user_id", userId).order("position"),
        supabase.from("profile_social_links").select("id,platform,username,url,position").eq("user_id", userId).order("platform"),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (contactsRes.error && contactsRes.error.code !== "42P01") throw contactsRes.error;
      if (linksRes.error && linksRes.error.code !== "42P01") throw linksRes.error;
      if (socialsRes.error && socialsRes.error.code !== "42P01") throw socialsRes.error;

      setProfile(
        profileRes.data || {
          user_id: userId,
          display_name: "Nouveau membre",
          handle: null,  // sera normalisé à l’affichage / à la sauvegarde
          flag: "🌍",
          bio: "",
          avatar_url: null,
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

  useEffect(() => { load(); }, [load]);

  const updateProfile = useCallback(
    async (updates) => {
      if (!userId) return { ok: false };
      setSaving(true);
      try {
        const payload = {
          user_id: userId,
          display_name: updates.display_name?.trim() || "Nouveau membre",
          handle: (updates.handle?.trim() && updates.handle.trim() !== "@membre")
            ? updates.handle.trim()
            : null,
          flag: updates.flag || "🌍",
          bio: updates.bio?.trim() || "",
          avatar_url: updates.avatar_url ?? null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("profiles")
          .upsert(payload, { onConflict: "user_id" })
          .select()
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
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ count: followers }, { count: following }, { count: posts }] =
        await Promise.all([
          supabase.from("follows").select("*", { count: "exact", head: true }).eq("followed_id", userId),
          supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
          supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", userId),
        ]);
      setStats({ followers: followers || 0, following: following || 0, posts: posts || 0 });
    })();
  }, [userId]);

  return stats;
}
