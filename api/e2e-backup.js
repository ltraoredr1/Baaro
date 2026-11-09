/**
 * Sauvegarde de la clé E2E protégée par un PIN à 4 chiffres.
 *
 * Un PIN à 4 chiffres n'a que 10 000 combinaisons : il n'est sûr que si le
 * nombre d'essais est limité PAR LE SERVEUR. Ce endpoint :
 *  - ne renvoie la sauvegarde (et le secret d'enveloppe) qu'après vérification
 *    d'une preuve dérivée du PIN (le PIN lui-même ne quitte jamais l'appareil) ;
 *  - bloque le compte après 5 erreurs (1 h, puis 24 h, puis 7 jours) ;
 *  - ne stocke jamais la clé privée en clair : elle est chiffrée côté client
 *    avec une clé qui dépend À LA FOIS du PIN et du secret d'enveloppe.
 *
 * Table : voir docs/e2e-pin-backup.sql (accès service_role uniquement).
 */
import crypto from "node:crypto";
import { getAdminClient, requireUser, applyCors, rateLimitAsync } from "./_shared.js";

const TABLE = "e2e_key_backups";
const FAILS_PER_LEVEL = 5;
const LOCK_DURATIONS_MS = [
  60 * 60 * 1000, // 1 h
  24 * 60 * 60 * 1000, // 24 h
  7 * 24 * 60 * 60 * 1000, // 7 jours
];
const MAX_BACKUP_BYTES = 16 * 1024;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function b64Bytes(value, expectedLength) {
  if (typeof value !== "string" || !B64.test(value)) return null;
  const buf = Buffer.from(value, "base64");
  return buf.length === expectedLength ? buf : null;
}

function getPepper() {
  const pepper = process.env.E2E_PIN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("E2E_PIN_PEPPER (32 caractères minimum) doit être définie.");
  }
  return pepper;
}

function hashProof(userId, proofBuf) {
  return crypto
    .createHmac("sha256", getPepper())
    .update(userId)
    .update(proofBuf)
    .digest("hex");
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const limit = await rateLimitAsync(req, {
    key: "e2e-backup",
    max: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  let user;
  try {
    admin = getAdminClient();
    getPepper();
  } catch (error) {
    console.error("[e2e-backup] configuration :", error.message);
    return res.status(500).json({ error: "Configuration serveur indisponible" });
  }

  try {
    user = await requireUser(req, admin);
  } catch (error) {
    return res.status(error.status || 401).json({
      error: error.message || "Utilisateur non authentifié",
    });
  }

  const body = req.body || {};
  const action = body.action;

  try {
    // ── status : le sel est public, il faut le connaître avant de calculer la preuve
    if (action === "status") {
      const { data, error } = await admin
        .from(TABLE)
        .select("salt, iter, locked_until, failed_attempts")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      if (!data) return res.json({ exists: false });

      const lockedUntil =
        data.locked_until && new Date(data.locked_until) > new Date()
          ? data.locked_until
          : null;

      return res.json({
        exists: true,
        salt: data.salt,
        iter: data.iter,
        lockedUntil,
        attemptsLeft: Math.max(0, FAILS_PER_LEVEL - (data.failed_attempts || 0)),
      });
    }

    // ── save : crée ou remplace la sauvegarde
    if (action === "save") {
      const proof = b64Bytes(body.proof, 32);
      const salt = b64Bytes(body.salt, 16);
      const wrapSecret = b64Bytes(body.wrapSecret, 32);
      const iter = body.iter;
      const backup = body.backup;

      if (
        !proof ||
        !salt ||
        !wrapSecret ||
        !Number.isInteger(iter) ||
        iter < 100_000 ||
        iter > 2_000_000 ||
        !backup ||
        typeof backup !== "object" ||
        JSON.stringify(backup).length > MAX_BACKUP_BYTES
      ) {
        return res.status(400).json({ error: "Données de sauvegarde invalides" });
      }

      const { error } = await admin.from(TABLE).upsert(
        {
          user_id: user.id,
          proof_hash: hashProof(user.id, proof),
          salt: salt.toString("base64"),
          iter,
          wrap_secret: wrapSecret.toString("base64"),
          backup,
          failed_attempts: 0,
          lock_level: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      return res.json({ ok: true });
    }

    // ── restore : vérifie la preuve, compte les échecs, applique les blocages
    if (action === "restore") {
      const proof = b64Bytes(body.proof, 32);
      if (!proof) return res.status(400).json({ error: "Preuve invalide" });

      const { data, error } = await admin
        .from(TABLE)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Aucune sauvegarde" });

      if (data.locked_until && new Date(data.locked_until) > new Date()) {
        return res.status(429).json({
          error: "Trop d'essais. Réessaie plus tard.",
          lockedUntil: data.locked_until,
          attemptsLeft: 0,
        });
      }

      if (safeEqualHex(hashProof(user.id, proof), data.proof_hash)) {
        await admin
          .from(TABLE)
          .update({ failed_attempts: 0, lock_level: 0, locked_until: null })
          .eq("user_id", user.id);

        return res.json({
          ok: true,
          backup: data.backup,
          wrapSecret: data.wrap_secret,
          salt: data.salt,
          iter: data.iter,
        });
      }

      // Mauvais PIN
      const fails = (data.failed_attempts || 0) + 1;
      const update = { failed_attempts: fails };
      let lockedUntil = null;

      if (fails >= FAILS_PER_LEVEL) {
        const level = Math.min(data.lock_level || 0, LOCK_DURATIONS_MS.length - 1);
        lockedUntil = new Date(Date.now() + LOCK_DURATIONS_MS[level]).toISOString();
        update.failed_attempts = 0;
        update.lock_level = (data.lock_level || 0) + 1;
        update.locked_until = lockedUntil;
      }

      await admin.from(TABLE).update(update).eq("user_id", user.id);

      return res.status(401).json({
        error: "PIN incorrect",
        attemptsLeft: lockedUntil ? 0 : FAILS_PER_LEVEL - fails,
        lockedUntil,
      });
    }

    // ── delete : suppression (réinitialisation de la clé)
    if (action === "delete") {
      const { error } = await admin.from(TABLE).delete().eq("user_id", user.id);
      if (error) throw error;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Action inconnue" });
  } catch (error) {
    console.error("[e2e-backup]", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
