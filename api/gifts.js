// api/gifts.js
// Envoi de cadeaux pendant un Live — même style que api/wallet.js
// (getAdminClient/requireUser, optimistic locking sur wallets.balance,
// journalisation dans transactions.pts).

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

// Catalogue de secours si gift_types n'est pas lue en base (source de vérité
// = table gift_types, mais on garde une copie ici pour valider vite sans
// aller-retour supplémentaire si tu préfères ne pas requêter la table à
// chaque envoi — sinon supprime ce const et lis toujours depuis la table).
// Ici on lit toujours depuis la table pour rester la seule source de vérité.

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isAnonymous(user) {
  return user?.is_anonymous === true;
}

async function handleAtomicGift(admin, userId, roomId, giftTypeId) {
  const { data, error } = await admin.rpc("wallet_send_gift", {
    p_sender_id: userId,
    p_room_id: roomId,
    p_gift_type_id: giftTypeId,
  });
  if (error) throw error;
  return data;
}

async function handleSendGift(admin, user, body, res) {
  if (isAnonymous(user)) return jsonError(res, 403, "Créez un compte pour envoyer des cadeaux");
  const { roomId, giftTypeId } = body;
  if (!roomId || !giftTypeId) return jsonError(res, 400, "Paramètres manquants");

  try {
    const result = await handleAtomicGift(admin, user.id, roomId, giftTypeId);
    return res.status(200).json({ ok: true, balance: Number(result.balance), gift: result.gift });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("INSUFFICIENT_BALANCE")) return jsonError(res, 400, "Solde insuffisant");
    if (msg.includes("LIVE_NOT_FOUND")) return jsonError(res, 404, "Live introuvable ou terminé");
    if (msg.includes("SELF_GIFT_FORBIDDEN")) return jsonError(res, 400, "Impossible de s'envoyer un cadeau à soi-même");
    if (msg.includes("GIFT_NOT_FOUND")) return jsonError(res, 404, "Type de cadeau inconnu");
    if (msg.includes("NOT_LIVE_PARTICIPANT")) return jsonError(res, 403, "Vous devez participer au Live pour envoyer un cadeau");
    throw e;
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const limit = rateLimit(req, { key: "gifts", max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée");

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return jsonError(res, 500, e.message);
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    return jsonError(res, e.status || 401, e.message);
  }

  const body = req.body || {};

  try {
    return await handleSendGift(admin, user, body, res);
  } catch (e) {
    console.error("Erreur /api/gifts :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
