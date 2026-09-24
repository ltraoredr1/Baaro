/**
 * Système cadeaux BARO pour Lives.
 * Identité : sender = auth.users.id (via JWT) — jamais un ID client.
 * receiverId (si fourni) doit être un UUID auth.users.id.
 */
import { supabase } from "../supabaseClient.js";

/** auth.users.id (UUID) uniquement */
function isValidAuthUserId(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("@") || (value.includes("@") && value.includes("."))) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function fetchGiftCatalog() {
  const { data } = await supabase
    .from("gifts_catalog")
    .select("*")
    .order("price_points");
  return data || [];
}

/**
 * Envoie un cadeau via /api/wallet (action send_gift).
 * L'identité de l'expéditeur est tirée du JWT — pas du body client.
 */
export async function sendGift({ debateId, roomId, receiverId, giftId, amount = 1 }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Non connecté");

  if (receiverId && !isValidAuthUserId(receiverId)) {
    throw new Error("receiverId invalide (UUID auth.users.id requis)");
  }

  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: "send_gift",
      roomId: roomId || debateId,
      giftId,
      amount,
      receiverId: receiverId || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Envoi du cadeau impossible");
  return data;
}

export function subscribeGifts(debateId, callback) {
  const channel = supabase
    .channel(`gifts-${debateId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "gifts_sent",
        filter: `room_id=eq.${debateId}`,
      },
      (payload) => callback(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function playGiftAnimation(gift, container) {
  if (!container) return;
  const el = document.createElement("div");
  el.textContent = gift.icon || "🎁";
  el.style.position = "absolute";
  el.style.bottom = "20%";
  el.style.left = Math.random() * 80 + 10 + "%";
  el.style.fontSize = gift.price_points > 100 ? "48px" : "32px";
  el.style.animation = "floatUp 3s ease-out forwards";
  el.style.pointerEvents = "none";
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
