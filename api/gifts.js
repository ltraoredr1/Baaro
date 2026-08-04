// api/gifts.js
// Envoi de cadeaux pendant un Live — même style que api/wallet.js
// (getAdminClient/requireUser, optimistic locking sur wallets.balance,
// journalisation dans transactions.pts).

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

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

async function getOrCreateWallet(admin, userId) {
  let { data: wallet } = await admin
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!wallet) {
    const { data: created, error } = await admin
      .from("wallets")
      .insert({ user_id: userId, balance: 1284 })
      .select()
      .single();
    if (error) throw error;
    wallet = created;
  }
  return wallet;
}

// Mise à jour atomique du solde (optimistic locking, même pattern que wallet.js)
async function applyBalanceDelta(admin, userId, previousBalance, delta) {
  const newBalance = Number(previousBalance) + delta;

  const { data, error } = await admin
    .from("wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", previousBalance)
    .select()
    .single();

  if (error || !data) return null;
  return newBalance;
}

async function handleSendGift(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour envoyer des cadeaux");
  }

  const { roomId, giftTypeId } = body;
  if (!roomId || !giftTypeId) {
    return jsonError(res, 400, "Paramètres manquants");
  }

  // 1. Coût réel du cadeau (jamais fourni par le client)
  const { data: giftType, error: giftError } = await admin
    .from("gift_types")
    .select("id, cost_points")
    .eq("id", giftTypeId)
    .maybeSingle();

  if (giftError || !giftType) {
    return jsonError(res, 404, "Type de cadeau inconnu");
  }

  // 2. Salon + hôte destinataire
  const { data: room, error: roomError } = await admin
    .from("debate_rooms")
    .select("id, host_id, status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError || !room || room.status !== "active") {
    return jsonError(res, 404, "Live introuvable ou terminé");
  }

  if (room.host_id === user.id) {
    return jsonError(res, 400, "Impossible de s'envoyer un cadeau à soi-même");
  }

  // 3. Débit de l'expéditeur (optimistic locking)
  const senderWallet = await getOrCreateWallet(admin, user.id);
  if (Number(senderWallet.balance) < giftType.cost_points) {
    return jsonError(res, 400, "Solde insuffisant");
  }

  const newSenderBalance = await applyBalanceDelta(
    admin,
    user.id,
    senderWallet.balance,
    -giftType.cost_points
  );
  if (newSenderBalance === null) {
    return jsonError(res, 409, "Conflit de solde, réessayez");
  }

  // 4. Crédit de l'hôte (optimistic locking, avec 1 retry en cas de course
  //    concurrente sur son wallet — plusieurs cadeaux peuvent arriver en
  //    même temps de spectateurs différents)
  let hostWallet = await getOrCreateWallet(admin, room.host_id);
  let newHostBalance = await applyBalanceDelta(
    admin,
    room.host_id,
    hostWallet.balance,
    giftType.cost_points
  );
  if (newHostBalance === null) {
    hostWallet = await getOrCreateWallet(admin, room.host_id);
    newHostBalance = await applyBalanceDelta(
      admin,
      room.host_id,
      hostWallet.balance,
      giftType.cost_points
    );
  }
  if (newHostBalance === null) {
    // Rollback du débit expéditeur si le crédit hôte échoue vraiment
    await applyBalanceDelta(admin, user.id, newSenderBalance, giftType.cost_points);
    return jsonError(res, 500, "Échec du crédit, réessayez");
  }

  // 5. Journalisation (transactions + gifts_sent)
  await admin.from("transactions").insert([
    { user_id: user.id, label: `Cadeau envoyé : ${giftType.id}`, pts: -giftType.cost_points },
    { user_id: room.host_id, label: `Cadeau reçu : ${giftType.id}`, pts: giftType.cost_points },
  ]);

  const { data: giftRecord, error: insertError } = await admin
    .from("gifts_sent")
    .insert({
      room_id: roomId,
      from_user_id: user.id,
      to_user_id: room.host_id,
      gift_type_id: giftType.id,
      points_spent: giftType.cost_points,
    })
    .select()
    .single();

  if (insertError) {
    return jsonError(res, 500, "Cadeau payé mais non enregistré, contacte le support");
  }

  // Realtime sur gifts_sent se charge de diffuser l'événement pour l'animation.
  return res.status(200).json({
    ok: true,
    balance: newSenderBalance,
    gift: giftRecord,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
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
