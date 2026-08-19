import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";
import { handleDbError } from "../lib/dbErrors.js";

export function useProfile(userId, showToast) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, handle, flag, bio, avatar_url, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      setProfile(
        data || {
          user_id: userId,
          display_name: "Nouveau membre",
          handle: "@membre",
          flag: "🌍",
          bio: "",
          avatar_url: null,
        }
      );
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
      if (!userId) return { ok: false };
      setSaving(true);
      try {
        const payload = {
          user_id: userId,
          display_name: updates.display_name?.trim() || "Nouveau membre",
          handle: updates.handle?.trim() || "@membre",
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

  return { profile, loading, saving, updateProfile, reload: load };
}

/** Compteurs abonnés / abonnements */
export function useProfileStats(userId) {
  const [stats, setStats] = useState({ followers: 0, following: 0, posts: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ count: followers }, { count: following }, { count: posts }] =
        await Promise.all([
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("followed_id", userId),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", userId),
          supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("author_id", userId),
        ]);
      setStats({
        followers: followers || 0,
        following: following || 0,
        posts: posts || 0,
      });
    })();
  }, [userId]);

  return stats;
        }
