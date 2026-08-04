// api/live-roles.js  (nouveau fichier)
// Promotion / rétrogradation d'un participant pendant un Live.
// - Met à jour debate_participants.role (source de vérité applicative)
// - Répercute IMMÉDIATEMENT la permission de diffuser via l'API Daily
//   (update-permissions), sans attendre que le participant recharge son
//   token. Daily applique ça au niveau du SFU : un viewer à qui on retire
//   canSend voit son flux coupé côté serveur, pas juste côté UI.
//
// Le client (l'hôte) doit fournir le session_id Daily du participant visé
// (disponible dans callObject.participants(), champ "session_id" — à
// faire correspondre à un user_id via le champ "user_id" du participant,
// qu'on renseigne maintenant dans le token lors du join, voir
// api/create-room.js).

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const DAILY_API_URL = "https://api.daily.co/v1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return res.status(500).json({ error: "DAILY_API_KEY manquante côté serveur" });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const { roomId, targetUserId, targetSessionId, role, dailyRoomName } = req.body || {};

  if (!roomId || !targetUserId || !targetSessionId || !role || !dailyRoomName) {
    return res.status(400).json({ error: "Paramètres manquants" });
  }

  if (!["co_host", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Rôle invalide (co_host ou viewer uniquement)" });
  }

  try {
    // 1. Vérifier que le demandeur est bien l'hôte de ce salon
    const { data: room, error: roomError } = await admin
      .from("debate_rooms")
      .select("id, host_id, status")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError || !room) {
      return res.status(404).json({ error: "Live introuvable" });
    }
    if (room.host_id !== user.id) {
      return res.status(403).json({ error: "Seul l'hôte peut gérer les co-hôtes" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "Live terminé" });
    }
    if (targetUserId === user.id) {
      return res.status(400).json({ error: "L'hôte ne peut pas modifier son propre rôle" });
    }

    // 2. Mettre à jour le rôle en base (source de vérité applicative,
    //    utilisée aussi au prochain join-room pour recalculer canSend)
    const { error: updateError } = await admin
      .from("debate_participants")
      .update({ role })
      .eq("room_id", roomId)
      .eq("user_id", targetUserId);

    if (updateError) throw updateError;

    // 3. Appliquer immédiatement côté Daily (SFU), sans attendre un
    //    rechargement de token par le participant visé.
    const canSend = role === "co_host" ? ["video", "audio"] : [];

    const permRes = await fetch(
      `${DAILY_API_URL}/rooms/${dailyRoomName}/update-permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            [targetSessionId]: { canSend },
          },
        }),
      }
    );

    if (!permRes.ok) {
      const err = await permRes.text();
      // Le rôle est déjà changé en base ; on log l'échec Daily mais on ne
      // rollback pas le rôle — au pire le participant retrouvera le bon
      // canSend à sa prochaine reconnexion (join-room recalcule le rôle).
      console.error("Erreur update-permissions Daily:", err);
      return res.status(200).json({
        ok: true,
        role,
        warning: "Rôle mis à jour, mais la coupure/activation immédiate du flux a échoué. Le participant devra peut-être recharger.",
      });
    }

    return res.status(200).json({ ok: true, role });
  } catch (error) {
    console.error("Erreur /api/live-roles :", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
