/**
 * src/features/messaging/hooks/usePresence.js
 * Présence "en ligne" via Supabase Realtime Presence (aucune table nécessaire).
 * Renvoie un Set des ids d'utilisateurs actuellement connectés à la messagerie.
 */
import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient.js";

export function usePresence(userId) {
  const [online, setOnline] = useState(() => new Set());

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("baaro-presence", { config: { presence: { key: userId } } });
    const sync = () => setOnline(new Set(Object.keys(ch.presenceState())));
    ch.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await ch.track({ at: new Date().toISOString() });
        } catch {
          /* présence indisponible : on ignore */
        }
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return online;
}
