import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ajustez le chemin si nécessaire

const MIN_QUERY_LENGTH = 2;

/**
 * Échappe et entoure de guillemets doubles une valeur destinée à
 * être injectée dans un filtre `.or()` de PostgREST.
 *
 * PostgREST utilise la virgule comme séparateur de conditions et
 * les parenthèses pour le groupement : sans ces guillemets, une
 * recherche contenant "," ou "(" / ")" casse la syntaxe du filtre
 * (ex : l'utilisateur tape "Traoré, Ibrahim").
 *
 * Les guillemets et backslashs déjà présents dans la valeur sont
 * eux-mêmes échappés pour rester valides une fois entre guillemets.
 */
function toSafeIlikePattern(value) {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

export function useGlobalSearch(query, delay = 300) {
  const [results, setResults] = useState({ users: [], debates: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const trimmed = (query || '').trim();

    // Si la requête est vide ou trop courte, on réinitialise
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults({ users: [], debates: [] });
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setError(null);

      const searchQuery = toSafeIlikePattern(trimmed);

      try {
        // Les deux recherches sont indépendantes : on les lance
        // en parallèle plutôt que l'une après l'autre.
        const [usersRes, debatesRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, display_name, handle, flag')
            .or(`display_name.ilike.${searchQuery},handle.ilike.${searchQuery}`)
            .limit(5),
          supabase
            .from('debate_rooms')
            .select('id, title, topic, invite_code, status')
            .eq('status', 'active')
            .or(`title.ilike.${searchQuery},topic.ilike.${searchQuery}`)
            .limit(5),
        ]);

        if (cancelled) return; // une recherche plus récente a pris le relais

        if (usersRes.error) throw usersRes.error;
        if (debatesRes.error) throw debatesRes.error;

        setResults({
          users: usersRes.data || [],
          debates: debatesRes.data || [],
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Erreur de recherche:', err);
        setError('Une erreur est survenue lors de la recherche.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    // Nettoyer le timer si l'utilisateur continue de taper,
    // et empêcher toute mise à jour d'état une fois obsolète.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, delay]);

  return { results, loading, error };
}
