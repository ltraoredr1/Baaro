import { useState, useCallback } from "react";
import { supabase } from "../supabaseClient.js";

export const useComments = ({ post_id, video_id } = {}) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!post_id &&!video_id) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/social?action=list_comments&${post_id?`post_id=${post_id}`:`video_id=${video_id}`}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    });
    const json = await res.json();
    setComments(json.comments || []); setLoading(false);
  }, [post_id, video_id]);

  const add = useCallback(async (text) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/social', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'comment', post_id, video_id, text })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    setComments(c => [...c, json.comment]);
    return json.comment;
  }, [post_id, video_id]);

  return { comments, loading, load, add };
};
