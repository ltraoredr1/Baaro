import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useGlobalSearch(query, delay = 300) {
  const [results, setResults] = useState({ users: [], debates: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults({ users: [], debates: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Recherche des utilisateurs
        const { data: users } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle, flag')
          .or(`display_name.ilike.%${query}%,handle.ilike.%${query}%`)
          .limit(5);

        // Recherche des débats actifs
        const { data: debates } = await supabase
          .from('debate_rooms')
          .select('id, title, topic, invite_code, status')
          .eq('status', 'active')
          .or(`title.ilike.%${query}%,topic.ilike.%${query}%`)
          .limit(5);

        setResults({ users: users || [], debates: debates || [] });
      } catch (error) {
        console.error('Erreur de recherche:', error);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [query, delay]);

  return { results, loading };
}
