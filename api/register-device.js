import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

// Au-delà de ce nombre de comptes créés depuis le même appareil, les
// nouveaux comptes sont marqués "restricted" (voir profiles.restricted) :
// ils gardent un accès normal à l'app mais perdent l'accès aux rachats à
// valeur réelle (carte cadeau, virement, conversion crypto). Un utilisateur
// déterminé à vider son stockage local peut contourner ce signal — c'est un
// frein contre la fraude opportuniste, pas un verrou absolu.
const MAX_ACCOUNTS_PER_DEVICE = 3;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
    return;
  }

  const { deviceId } = req.body || {};
  if (!deviceId || typeof deviceId !== "string" || deviceId.length > 200) {
    res.status(400).json({ error: "deviceId invalide" });
    return;
  }

  try {
    await admin
      .from("device_accounts")
      .upsert({ device_id: deviceId, user_id: user.id }, { onConflict: "device_id,user_id", ignoreDuplicates: true });

    const { count } = await admin
      .from("device_accounts")
      .select("user_id", { count: "exact", head: true })
      .eq("device_id", deviceId);

    const restricted = (count || 0) > MAX_ACCOUNTS_PER_DEVICE;
    await admin.from("profiles").update({ restricted }).eq("user_id", user.id);

    res.status(200).json({ ok: true, accountsOnDevice: count || 0, restricted });
  } catch (e) {
    console.error("Erreur /api/register-device :", e);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de l'appareil" });
  }
}
