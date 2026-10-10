import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../supabaseClient.js";

// Bibliothèque de sons (table sounds + bibliothèque audio) et son d'une vidéo.
export function useSounds() {
  const [sounds, setSounds] = useState([]);

  useEffect(() => {
    let active = true;

    (async () => {
      const merged = new Map();
      try {
        const { data } = await supabase
          .from("sounds")
          .select("*")
          .order("usage_count", { ascending: false })
          .limit(50);
        (data || []).forEach((item) => {
          if (item?.audio_url) merged.set(String(item.id), item);
        });
      } catch {
        // table absente ou inaccessible : on continue avec la bibliothèque audio
      }
      try {
        const { data, error } = await supabase.rpc("search_audio_library", {
          p_query: null,
          p_genre: null,
          p_limit: 50,
        });
        if (!error) {
          (data || []).forEach((track) => {
            const key = String(track.id);
            if (track?.audio_url && !merged.has(key)) {
              merged.set(key, {
                id: track.id,
                title: track.title,
                artist: track.artist,
                audio_url: track.audio_url,
              });
            }
          });
        }
      } catch {
        // bibliothèque audio indisponible
      }
      if (active) setSounds(Array.from(merged.values()));
    })();

    return () => {
      active = false;
    };
  }, []);

  const soundsById = useMemo(() => {
    const map = {};
    sounds.forEach((item) => {
      map[String(item.id)] = item;
    });
    return map;
  }, [sounds]);

  const getVideoSound = useCallback(
    (video) => {
      const known = video.sound_id ? soundsById[String(video.sound_id)] : null;
      const url = video.sound_url || known?.audio_url || null;
      if (!url) return null;
      return {
        url,
        title: video.sound_title || known?.title || "Son BAARO",
        artist: known?.artist || "",
      };
    },
    [soundsById],
  );

  return { sounds, getVideoSound };
}
