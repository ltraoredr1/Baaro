import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

// [STRIPPED 69 bytes]
// Publications (fil d'actualité)
// scope: "all" | "following" | "friends"
// id unique : profiles.id = auth.uid() = author_id = user_id
// [STRIPPED 69 bytes]

async function uploadPostMedia(userId, file) {
  try {
    if (!file ||!userId) return { url: null, type: null };
    const ext = (file.name?.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    const path = `${userId}/${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return { url: data?.publicUrl || null, type: file.type.startsWith("video")? "video" : "image" };
  } catch (e) {
    console.warn("Upload média impossible :", e.message);
    return { url: null, type: null };
  }
}

// Renvoie les author_id pour un scope. null = pas de restriction (all)
async function resolveScopeAuthorIds(userId, scope) {
  if (!userId || scope === "all") return null;

  const { data: rows, error } = await supabase
  .from("follows")
  .select("followed_id, is_friend")
  .eq("follower_id", userId)
  .eq("status", "accepted");

  if (error) {
    console.warn("resolveScopeAuthorIds:", error.message);
    return [userId]; // fallback: au moins moi
  }

  const ids = (rows || [])
  .filter((r) => (scope === "friends"? r.is_friend === true : true))
  .map((r) => r.followed_id)
  .filter(Boolean);

  // IMPORTANT: toujours inclure mes propres posts dans following/friends
  return [...new Set([...ids, userId])];
}

export function usePosts(userId, scope = "all") {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId && scope!== "all") {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const scopeIds = await resolveScopeAuthorIds(userId, scope);

      // Cas following/friends sans personne (ne devrait plus arriver car on inclut userId)
      if (scopeIds!== null && scopeIds.length === 0) {
        setPosts([]);
        return;
      }

      let query = supabase
      .from("posts")
      .select("id, author_id, text, media_url, media_type, created_at, profiles!author_id(display_name, handle, flag, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(50);

      if (scopeIds!== null) {
        query = query.in("author_id", scopeIds);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      const ids = (rows || []).map((p) => p.id);
      let likeRows = [];
      let commentRows = [];

      if (ids.length > 0) {
        const [{ data: likes }, { data: comments }] = await Promise.all([
          supabase.from("post_likes").select("post_id, user_id").in("post_id", ids),
          supabase.from("comments").select("post_id").in("post_id", ids),
        ]);
        likeRows = likes || [];
        commentRows = comments || [];
      }

      setPosts(
        (rows || []).map((p) => ({
          id: p.id,
          authorId: p.author_id,
          name: p.profiles?.display_name || "Membre BAARO",
          flag: p.profiles?.flag || "🌍",
          handle: p.profiles?.handle || "",
          avatar_url: p.profiles?.avatar_url || null,
          text: p.text,
          mediaUrl: p.media_url,
          mediaType: p.media_type,
          liked: likeRows.some((l) => l.post_id === p.id && l.user_id === userId),
          likes: likeRows.filter((l) => l.post_id === p.id).length,
          comments: commentRows.filter((c) => c.post_id === p.id).length,
          earned: 0,
        }))
      );
    } catch (e) {
      console.error("[usePosts] load:", e.message);
    } finally {
      setLoading(false);
    }
  }, [userId, scope]);

  useEffect(() => { load(); }, [load]);

  // Realtime fil
  useEffect(() => {
    const channel = supabase
    .channel("posts-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => load())
    .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load]);

  const likePost = useCallback(async (postId) => {
    if (!userId) return;
    let alreadyLiked = false;

    // Optimistic update sans dépendance à `posts`
    setPosts((prev) => {
      const current = prev.find((p) => p.id === postId);
      alreadyLiked =!!current?.liked;
      return prev.map((p) =>
        p.id === postId? {...p, liked:!alreadyLiked, likes: p.likes + (alreadyLiked? -1 : 1) } : p
      );
    });

    try {
      if (alreadyLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
      }
    } catch (e) {
      // Rollback si erreur
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId? {...p, liked: alreadyLiked, likes: p.likes + (alreadyLiked? 1 : -1) } : p
        )
      );
    }
  }, [userId]);

  const createPost = useCallback(async (text, file) => {
    if (!userId) return;
    let media = { url: null, type: null };
    if (file) media = await uploadPostMedia(userId, file);
    const { error } = await supabase.from("posts").insert({
      author_id: userId,
      text: text || "",
      media_url: media.url,
      media_type: media.type,
    });
    if (error) throw error;
    await load();
  }, [userId, load]);

  return { posts, loading, likePost, createPost, reload: load };
}
