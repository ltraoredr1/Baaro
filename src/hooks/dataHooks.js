// ---------------------------------------------------------------------
// Publications (fil d'actualité)
// scope: "all" (tout le monde) | "following" (abonnements) | "friends" (amis mutuels)
// ---------------------------------------------------------------------
async function uploadPostMedia(userId, file) {
  try {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${userId}/${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return { url: data?.publicUrl || null, type: file.type.startsWith("video") ? "video" : "image" };
  } catch (e) {
    console.warn("Upload média impossible :", e.message);
    return { url: null, type: null };
  }
}

// Renvoie la liste des author_id à afficher pour un scope donné.
// null = pas de restriction (scope "all").
async function resolveScopeAuthorIds(userId, scope) {
  if (!userId || scope === "all") return null;

  const { data: rows } = await supabase
    .from("follows")
    .select("followed_id, is_friend")
    .eq("follower_id", userId)
    .eq("status", "accepted");

  const ids = (rows || [])
    .filter((r) => (scope === "friends" ? r.is_friend === true : true))
    .map((r) => r.followed_id);

  return ids;
}

export function usePosts(userId, scope = "all") {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const scopeIds = await resolveScopeAuthorIds(userId, scope);

    // Scope "following"/"friends" sans personne suivie -> fil vide, pas d'appel inutile.
    if (scopeIds !== null && scopeIds.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("posts")
      .select("id, author_id, text, media_url, media_type, created_at, profiles(display_name, handle, flag)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (scopeIds !== null) {
      query = query.in("author_id", scopeIds);
    }

    const { data: rows } = await query;

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
        text: p.text,
        mediaUrl: p.media_url,
        mediaType: p.media_type,
        liked: likeRows.some((l) => l.post_id === p.id && l.user_id === userId),
        likes: likeRows.filter((l) => l.post_id === p.id).length,
        comments: commentRows.filter((c) => c.post_id === p.id).length,
        earned: 0,
      }))
    );
    setLoading(false);
  }, [userId, scope]);

  useEffect(() => {
    load();
  }, [load]);

  // Rafraîchit le fil en direct dès qu'une publication est ajoutée, modifiée ou supprimée.
  useEffect(() => {
    const channel = supabase
      .channel("posts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const likePost = useCallback(
    async (postId) => {
      if (!userId) return;
      const current = posts.find((p) => p.id === postId);
      const alreadyLiked = !!current?.liked;
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked: !alreadyLiked, likes: p.likes + (alreadyLiked ? -1 : 1) } : p))
      );
      if (alreadyLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: userId });
      }
    },
    [userId, posts]
  );

  const createPost = useCallback(
    async (text, file) => {
      if (!userId) return;
      let media = { url: null, type: null };
      if (file) media = await uploadPostMedia(userId, file);
      await supabase.from("posts").insert({
        author_id: userId,
        text: text || "",
        media_url: media.url,
        media_type: media.type,
      });
      await load();
    },
    [userId, load]
  );

  return { posts, loading, likePost, createPost, reload: load };
}
