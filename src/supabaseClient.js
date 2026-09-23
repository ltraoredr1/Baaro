// FIX 1 - Follows : filtre bloqués + évite injection
export const getFriends = async () => {
  const userId = await getCurrentUserId();
  const { data: blocks } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", userId);
  const blockedSet = new Set((blocks||[]).map(b=>b.blocked_id));

  const { data, error } = await supabase.from("follows")
    .select("follower_id,followed_id")
    .eq("is_friend", true).eq("status", "accepted")
    .or(`follower_id.eq.${userId},followed_id.eq.${userId}`);

  const ids = (data||[]).map(r => r.follower_id === userId ? r.followed_id : r.follower_id)
                        .filter(id => !blockedSet.has(id));
  return { data: [...new Set(ids)], error };
};

// FIX 2 - Comments : helper qui passe par /api/social (bypass RLS + video_id)
export const addComment = async ({ post_id, video_id, text }) => {
  const { data:{ session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/social`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ action: 'comment', post_id, video_id, text })
  });
  return res.json();
};

// FIX 3 - Client : pas de placeholder silencieux
if (!supabaseUrl || !supabaseAnonKey) throw new Error("VITE_SUPABASE_URL manquante");
