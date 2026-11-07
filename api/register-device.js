/**
 * Enregistrement appareil ↔ compte.
 * Schéma: device_accounts(device_id, id) où id = auth.users.id
 * Pas de colonne user_id (identité unique = id).
 */
import { getAdminClient, requireUser, applyCors, rateLimitAsync } from "./_shared.js";

const MAX_ACCOUNTS_PER_DEVICE = 3;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const limit = await rateLimitAsync(req, {
    key: "register-device",
    max: 10,
    windowMs: 60_000,
  });

  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error("Erreur client Supabase :", error);
    return res.status(500).json({ error: "Configuration serveur indisponible" });
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (error) {
    return res.status(error.status || 401).json({
      error: error.message || "Utilisateur non authentifié",
    });
  }

  const { deviceId } = req.body || {};
  if (
    typeof deviceId !== "string" ||
    deviceId.trim().length === 0 ||
    deviceId.length > 200
  ) {
    return res.status(400).json({ error: "deviceId invalide" });
  }

  const normalizedDeviceId = deviceId.trim();

  try {
    const { data: ownLink, error: ownLinkError } = await admin
      .from("device_accounts")
      .select("id")
      .eq("device_id", normalizedDeviceId)
      .eq("id", user.id)
      .maybeSingle();

    if (ownLinkError) {
      return res.status(500).json({
        error: "Impossible de vérifier l'appareil",
      });
    }

    const { count: existingCount, error: existingCountError } = await admin
      .from("device_accounts")
      .select("id", { count: "exact", head: true })
      .eq("device_id", normalizedDeviceId);

    if (existingCountError) {
      return res.status(500).json({
        error: "Impossible de vérifier la limite",
      });
    }

    if (!ownLink && (existingCount || 0) >= MAX_ACCOUNTS_PER_DEVICE) {
      return res.status(403).json({
        ok: false,
        allowed: false,
        accountCount: existingCount,
        maxAccounts: MAX_ACCOUNTS_PER_DEVICE,
        error: `Limite atteinte : max ${MAX_ACCOUNTS_PER_DEVICE} comptes par appareil`,
      });
    }

    const { error: upsertError } = await admin.from("device_accounts").upsert(
      {
        id: user.id,
        device_id: normalizedDeviceId,
      },
      {
        onConflict: "device_id,id",
        ignoreDuplicates: true,
      }
    );

    if (upsertError) {
      console.error("Erreur lors de l'enregistrement de l'appareil :", upsertError);
      return res.status(500).json({
        error: "Impossible d'enregistrer l'appareil",
        details: upsertError.message,
      });
    }

    const { count, error: countError } = await admin
      .from("device_accounts")
      .select("id", { count: "exact", head: true })
      .eq("device_id", normalizedDeviceId);

    if (countError) {
      console.error("Erreur comptage appareils :", countError);
      return res.status(500).json({ error: "Impossible de vérifier la limite" });
    }

    const accountCount = count || 0;
    const allowed = accountCount <= MAX_ACCOUNTS_PER_DEVICE;

    return res.status(200).json({
      ok: true,
      allowed,
      accountCount,
      maxAccounts: MAX_ACCOUNTS_PER_DEVICE,
      message: allowed
        ? null
        : `Limite atteinte : max ${MAX_ACCOUNTS_PER_DEVICE} comptes par appareil`,
    });
  } catch (e) {
    console.error("[register-device]", e);
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
}
