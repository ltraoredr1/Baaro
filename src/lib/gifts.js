// src/lib/gifts.js  (nouveau fichier)
// Wrapper client pour le catalogue de cadeaux et l'envoi, à utiliser dans
// DebateRoom.jsx.

import { supabase } from "../supabaseClient.js";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchGiftCatalog() {
  const { data, error } = await supabase
    .from("gift_types")
    .select("*")
    .order("cost_points");
  return { data, error };
}

/** Envoie un cadeau — passe toujours par le serveur (jamais d'écriture
 *  directe dans wallets/transactions/gifts_sent depuis le client). */
export async function sendGift({ roomId, giftTypeId }) {
  const res = await fetch("/api/gifts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ roomId, giftTypeId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi du cadeau");
  return data;
}

/** Abonnement temps réel aux cadeaux reçus dans un live, pour l'animation
 *  à l'écran (même principe que les cœurs, si déjà en place). */
export function subscribeGifts(roomId, onGift) {
  const channel = supabase
    .channel(`debate-gifts-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "gifts_sent",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => onGift(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/** Abonnement temps réel aux changements de rôle (promotion/rétrogradation
 *  de co-hôtes), pour mettre à jour l'UI et déverrouiller enableCamera/
 *  enableMic côté client promu. */
export function subscribeRoles(roomId, onChange) {
  const channel = supabase
    .channel(`debate-roles-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "debate_participants",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => onChange(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
