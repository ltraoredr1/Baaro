import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

export function useFollow(userId, targetId) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !targetId || userId === targetId) return;
    (async () => {
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", userId)
        .eq("followed_id", targetId)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [userId, targetId]);

  const toggleFollow = useCallback(async () => {
    if (!userId || !targetId || userId === targetId || loading) return;
    setLoading(true);
    try {
      if (isFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("followed_id", targetId);
        setIsFollowing(false);
      } else {
        await supabase.from("follows").insert({
          follower_id: userId,
          followed_id: targetId,
        });
        setIsFollowing(true);
        // notification optionnelle
        await supabase.from("notifications").insert({
          user_id: targetId,
          message: "Quelqu'un s'est abonné à vous",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [userId, targetId, isFollowing, loading]);

  return { isFollowing, toggleFollow, loading };
}

export function useComments(postId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select("id, text, created_at, author_id, profiles(display_name, handle, flag)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setComments(
      (data || []).map((c) => ({
        id: c.id,
        text: c.text,
        author: c.profiles?.display_name || "Membre",
        handle: c.profiles?.handle || "",
        flag: c.profiles?.flag || "🌍",
        created_at: c.created_at,
      }))
    );
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(
    async (userId, text) => {
      if (!userId || !text?.trim()) return false;
      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: userId,
        text: text.trim(),
      });
      if (!error) {
        await load();
        return true;
      }
      return false;
    },
    [postId, load]
  );

  return { comments, loading, addComment, reload: load };
}
