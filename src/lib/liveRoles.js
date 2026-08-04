// api/live-roles.js
// Permet à l'hôte d'origine d'un salon (room.host_id) de promouvoir un
// spectateur en co-hôte, ou de rétrograder un co-hôte en spectateur.
//
// Deux effets, dans cet ordre :
// 1. Met à jour debate_participants.role (source de vérité applicative).
//    Ce UPDATE déclenche un événement Realtime que le client de la
//    personne concernée écoute pour réagir immédiatement (voir
//    DebateRoom.jsx / upgradeLocalRole()).
// 2. Si on connaît le session_id Daily actuel du participant (transmis
//    par le client hôte via findParticipantSessionId()), met aussi à
//    jour ses permissions d'envoi audio/vidéo en direct via l'API Daily,
//    pour que le blocage/déblocage soit appliqué par le SFU sans attendre
//    une reconnexion. Si ce session_id est absent (participant pas encore
//    dans l'appel vocal), le rôle en base est quand même à jour : le
//    prochain join-room lui donnera un token avec les bonnes permissions.

import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

const DAILY_API_URL = "https://api.daily.co/v1";
// 'host' n'est jamais assigné ici : il est unique, fixé à la création du
// salon (voir create-room.js) et ne peut pas être transféré par cet
// endpoint.
const VALID_ROLES = ["viewer", "co_host"];

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

  const { roomId, targetUserId, newRole, dailySessionId } = req.body || {};

  if (!roomId || !targetUserId || !newRole) {
    return res
      .status(400)
      .json({ error: "roomId, targetUserId et newRole sont requis" });
  }
  if (!VALID_ROLES.includes(newRole)) {
    return res
      .status(400)
      .json({ error: "newRole invalide (attendu : 'co_host' ou 'viewer')" });
  }
  if (targetUserId === user.id) {
    return res.status(400).json({ error: "Impossible de modifier son propre rôle" });
  }

  try {
    // Seul l'hôte d'origine du salon peut changer les rôles.
    const { data: room, error: roomError } = await admin
      .from("debate_rooms")
      .select("id, host_id, daily_room_name, status")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) return res.status(404).json({ error: "Salon introuvable" });
    if (room.host_id !== user.id) {
      return res
        .status(403)
        .json({ error: "Seul l'hôte peut modifier les rôles des participants" });
    }
    if (room.status !== "active") {
      return res.status(400).json({ error: "Ce live est terminé" });
    }

    // Vérifie que la cible est bien un participant actif du salon.
    const { data: targetParticipant, error: targetError } = await admin
      .from("debate_participants")
      .select("id, role")
      .eq("room_id", roomId)
      .eq("user_id", targetUserId)
      .is("left_at", null)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetParticipant) {
      return res
        .status(404)
        .json({ error: "Ce participant n'est pas (ou plus) dans le live" });
    }
    if (targetParticipant.role === "host") {
      return res.status(400).json({ error: "Impossible de modifier le rôle de l'hôte" });
    }

    // 1. Mise à jour en base (déclenche le Realtime côté client).
    const { error: updateError } = await admin
      .from("debate_participants")
      .update({ role: newRole })
      .eq("id", targetParticipant.id);

    if (updateError) throw updateError;

    // 2. Permissions Daily en direct, si on a le session_id courant.
    if (dailySessionId && room.daily_room_name) {
      const canSend = newRole === "co_host" ? ["video", "audio"] : [];

      const permRes = await fetch(
        `${DAILY_API_URL}/rooms/${room.daily_room_name}/update-permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DAILY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: {
              [dailySessionId]: { canSend },
            },
          }),
        }
      );

      if (!permRes.ok) {
        const err = await permRes.text();
        console.error("Erreur update-permissions Daily:", err);
        // Le rôle en base est déjà correct ; on prévient sans faire
        // échouer toute la requête (le prochain join-room corrigera les
        // permissions Daily si celle-ci en direct a échoué).
        return res.status(200).json({
          success: true,
          role: newRole,
          warning:
            "Rôle mis à jour, mais la permission live n'a pas pu être appliquée immédiatement.",
        });
      }
    }

    return res.status(200).json({ success: true, role: newRole });
  } catch (error) {
    console.error("Erreur /api/live-roles :", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
