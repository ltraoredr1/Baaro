import crypto from "node:crypto";
import { getAdminClient } from "./_shared.js";
import { processPushNotificationQueue } from "./_lib/push.js";

const CRON_SECRET = process.env.CRON_SECRET || "";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }
  if (!CRON_SECRET) {
    console.error("[push-queue] CRON_SECRET manquant.");
    return res.status(503).json({ error: "Worker non configuré" });
  }
  if (!safeEqual(req.headers.authorization, `Bearer ${CRON_SECRET}`)) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error("[push-queue] Client Supabase indisponible :", error.message);
    return res.status(503).json({ error: "Stockage de file indisponible" });
  }

  try {
    const result = await processPushNotificationQueue(admin);
    if (!result.ok || result.errors > 0) {
      console.error("[push-queue] Traitement incomplet :", result.error || result);
      return res.status(500).json({
        ok: false,
        claimed: result.claimed || 0,
        errors: result.errors || 0,
        error: result.error || "Certains jobs n'ont pas pu être finalisés.",
      });
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error("[push-queue] Échec du traitement :", error.message);
    return res.status(500).json({ error: "Échec du traitement de la file" });
  }
}
