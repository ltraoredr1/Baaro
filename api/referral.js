import { randomInt } from "node:crypto";
import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

const REFERRER_REWARD = 25; // pts pour le parrain
const REFERRED_REWARD = 15; // pts pour le filleul
const CODE_PREFIX = "BAARO";

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isAnonymous(user) {
  return user?.is_anonymous === true;
}

/** Génère un code court unique (ex: BAARO-A7K2M9) */
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let part = "";
  for (let i = 0; i < 6; i++) {
    part += chars[randomInt(0, chars.length)];
  }
  return `${CODE_PREFIX}-${part}`;
}

async function ensureReferralCode(admin, userId) {
  const { data: profile } = await admin
    .from("profiles")
    .select("referral_code")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.referral_code) {
    return profile.referral_code;
  }

  // Essaye jusqu'à 5 fois en cas de collision
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const { data, error } = await admin
      .from("profiles")
      .update({ referral_code: code })
      .eq("user_id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();

    if (!error && data?.referral_code) return data.referral_code;

    // Si déjà un code (race), on relit
    const { data: again } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (again?.referral_code) return again.referral_code;
  }

  throw new Error("Impossible de générer un code de parrainage");
}

/** GET mon code + stats */
async function handleGetMyCode(admin, user, res) {
  if (isAnonymous(user)) {
    return res.status(200).json({
      ok: true,
      isAnonymous: true,
      code: null,
      link: null,
      stats: { count: 0, totalPts: 0 },
      message: "Créez un compte pour obtenir un code de parrainage",
    });
  }

  const code = await ensureReferralCode(admin, user.id);
  const base =
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_API_BASE_URL ||
    "https://baaro.app";
  const link = `${base.replace(/\/$/, "")}/?ref=${code}`;

  const { data: rewards } = await admin
    .from("referral_rewards")
    .select("pts_referrer")
    .eq("referrer_id", user.id);

  const count = (rewards || []).length;
  const totalPts = (rewards || []).reduce(
    (s, r) => s + Number(r.pts_referrer || 0),
    0
  );

  return res.status(200).json({
    ok: true,
    isAnonymous: false,
    code,
    link,
    stats: { count, totalPts },
  });
}

/**
 * Appliquer un code de parrainage (appelé une fois par le filleul).
 * Body: { code: "BAARO-XXXXXX" }
 */
async function handleApply(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour utiliser un code de parrainage");
  }

  const code = String(body.code || "")
    .trim()
    .toUpperCase();
  if (!code || code.length < 6) {
    return jsonError(res, 400, "Code de parrainage invalide");
  }

  // Déjà parrainé ?
  const { data: me } = await admin
    .from("profiles")
    .select("referred_by, referral_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (me?.referred_by) {
    return jsonError(res, 409, "Vous avez déjà utilisé un code de parrainage");
  }

  // Trouver le parrain
  const { data: referrer } = await admin
    .from("profiles")
    .select("user_id, referral_code")
    .eq("referral_code", code)
    .maybeSingle();

  if (!referrer) {
    return jsonError(res, 404, "Code de parrainage introuvable");
  }

  if (referrer.user_id === user.id) {
    return jsonError(res, 400, "Vous ne pouvez pas utiliser votre propre code");
  }

  try {
    const { data, error } = await admin.rpc("apply_referral_reward", {
      p_referrer_id: referrer.user_id,
      p_referred_id: user.id,
      p_code: code,
      p_referrer_pts: REFERRER_REWARD,
      p_referred_pts: REFERRED_REWARD,
    });
    if (error) throw error;
    return res.status(200).json({ ok: true, reward: data?.reward || null });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("REFERRAL_ALREADY_APPLIED")) return jsonError(res, 409, "Vous avez déjà utilisé un code de parrainage");
    if (msg.includes("INVALID_REFERRAL_CODE")) return jsonError(res, 404, "Code de parrainage introuvable");
    console.error("referral apply:", e);
    return jsonError(res, 500, "Erreur application parrainage");
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée");
  }

  const limit = rateLimit(req, { key: "referral", max: 20, windowMs: 60_000 });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(limit.status).json(limit.body);
  }

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
    if (body.action === "my-code") return await handleGetMyCode(admin, user, res);
    if (body.action === "apply") return await handleApply(admin, user, body, res);
    return jsonError(res, 400, "Action inconnue (my-code | apply)");
  } catch (e) {
    console.error("Erreur /api/referral :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
