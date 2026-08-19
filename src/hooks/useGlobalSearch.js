import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ajustez le chemin si nécessaire

export function useGlobalSearch(query, delay = 300) {
  const [results, setResults] = useState({ users: [], debates: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Si la requête est vide ou trop courte, on réinitialise
    if (!query || query.trim().length < 2) {
      setResults({ users: [], debates: [] });
      setLoading(false);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const searchQuery = `%${query.trim()}%`;

      try {
        // 1. Recherche des utilisateurs (par nom ou pseudo)
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle, flag')
          .or(`display_name.ilike.${searchQuery},handle.ilike.${searchQuery}`)
          .limit(5);

        if (usersError) throw usersError;

        // 2. Recherche des débats actifs (par titre ou sujet)
        const { data: debates, error: debatesError } = await supabase
          .from('debate_rooms')
          .select('id, title, topic, invite_code, status')
          .eq('status', 'active')
          .or(`title.ilike.${searchQuery},topic.ilike.${searchQuery}`)
          .limit(5);

        if (debatesError) throw debatesError;

        setResults({ 
          users: users || [], 
          debates: debates || [] 
        });
      } catch (err) {
        console.error('Erreur de recherche:', err);
        setError('Une erreur est survenue lors de la recherche.');
      } finally {
        setLoading(false);
      }
    }, delay);

    // Nettoyer le timer si l'utilisateur continue de taper
    return () => clearTimeout(timer);
  }, [query, delay]);

  return { results, loading, error };
            }
