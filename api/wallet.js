import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

// ============================================================
// Configuration des gains et limites
// ============================================================

const DAILY_EARN_CAP = 100;
const MIN_ACCOUNT_AGE_MS_FOR_CASHOUT = 3 * 24 * 60 * 60 * 1000;
const POINTS_PER_BARO = 100;
const WELCOME_BONUS = 50;

const EARN_ACTIONS = {
  like_post: { pts: 2, label: "Interaction sur une publication" },
  publish_post: { pts: 5, label: "Nouvelle publication" },
  publish_post_media: { pts: 8, label: "Publication avec média" },
  comment: { pts: 1, label: "Commentaire ajouté" },
  watch_video: { pts: 1, label: "Vue générée" },
  subscribe: { pts: 5, label: "Abonnement activé" },
  like_video: { pts: 2, label: "Vidéo aimée" },
  publish_video: { pts: 25, label: "Vidéo publiée" },
  repost_video: { pts: 5, label: "Repost vidéo" },
  tip_video: { pts: 5, label: "Tip envoyé" },
  comment_video: { pts: 2, label: "Commentaire vidéo" },
  daily_bonus: { pts: 10, label: "Bonus quotidien" },
};

const REDEEM_OPTIONS = {
  r1: { cost: 500, label: "Carte cadeau partenaire — 5 €", cash: true },
  r2: { cost: 1000, label: "Virement via Stripe Connect — 10 €", cash: true },
  r3: { cost: 300, label: "Badge Créateur Premium (statut)", cash: false },
  r4: { cost: 150, label: "Boost de visibilité 48h", cash: false },
};

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isAnonymous(user) {
  return user?.is_anonymous === true;
}

async function getProfile(admin, userId) {
  const { data } = await admin
    .from("profiles")
    .select("created_at, restricted")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function todaysEarnedTotal(admin, userId) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data } = await admin
    .from("transactions")
    .select("pts")
    .eq("user_id", userId)
    .gt("pts", 0)
    .gte("created_at", since.toISOString());

  return (data || []).reduce((sum, tx) => sum + Number(tx.pts), 0);
}

/** Vérifie si le bonus quotidien a déjà été pris aujourd'hui */
async function hasClaimedDailyBonus(admin, userId) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count } = await admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("label", "Bonus quotidien")
    .gte("created_at", since.toISOString());

  return (count || 0) > 0;
}

async function rpcWallet(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function ensureWallet(admin, user) {
  return rpcWallet(admin, "wallet_ensure", { p_user_id: user.id, p_welcome_bonus: isAnonymous(user) ? 0 : WELCOME_BONUS });
}

async function cashoutEligibility(admin, user) {
  if (isAnonymous(user)) {
    return { ok: false, reason: "Créez un compte pour accéder aux rachats" };
  }
  const profile = await getProfile(admin, user.id);
  if (!profile) return { ok: false, reason: "Profil introuvable" };
  if (profile.restricted) {
    return {
      ok: false,
      reason: "Compte restreint (plusieurs comptes détectés sur cet appareil)",
    };
  }
  const ageMs = Date.now() - new Date(profile.created_at).getTime();
  if (ageMs < MIN_ACCOUNT_AGE_MS_FOR_CASHOUT) {
    return {
      ok: false,
      reason: "Compte trop récent (3 jours d'ancienneté requis)",
    };
  }
  return { ok: true };
}

async function handleStatus(admin, user, res) {
  const wallet = await ensureWallet(admin, user);
  const earnedToday = await todaysEarnedTotal(admin, user.id);
  const remaining = Math.max(0, DAILY_EARN_CAP - earnedToday);
  const dailyClaimed = await hasClaimedDailyBonus(admin, user.id);

  let holdings = 0;
  const { data: crypto } = await admin
    .from("crypto_holdings")
    .select("holdings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (crypto) holdings = Number(crypto.holdings) || 0;

  return res.status(200).json({
    ok: true,
    balance: Number(wallet.balance),
    holdings,
    earnedToday,
    dailyCap: DAILY_EARN_CAP,
    remainingToday: remaining,
    dailyClaimed,
    isAnonymous: isAnonymous(user),
  });
}

async function handleEarn(admin, user, body, res) {
  if (isAnonymous(user)) {
    const wallet = await ensureWallet(admin, user);
    return res.status(200).json({
      ok: true,
      balance: Number(wallet.balance),
      transaction: null,
      note: "Compte invité : aucun point gagné",
      earnedToday: 0,
      remainingToday: 0,
      dailyCap: DAILY_EARN_CAP,
    });
  }

  const rule = EARN_ACTIONS[body.actionKey];
  if (!rule) {
    return jsonError(res, 400, "Action de gain inconnue");
  }

  // Bonus quotidien : une seule fois par jour
  if (body.actionKey === "daily_bonus") {
    const already = await hasClaimedDailyBonus(admin, user.id);
    if (already) {
      return jsonError(res, 429, "Bonus quotidien déjà réclamé aujourd'hui");
    }
  }

  const detail =
    typeof body.detail === "string"
      ? body.detail.slice(0, 80).replace(/[\r\n]/g, " ")
      : "";
  const label =
    body.actionKey === "daily_bonus"
      ? "Bonus quotidien"
      : detail
        ? `${rule.label} — ${detail}`
        : rule.label;

  const earnedToday = await todaysEarnedTotal(admin, user.id);
  if (earnedToday >= DAILY_EARN_CAP) {
    return jsonError(res, 429, "Plafond quotidien de gains atteint, réessayez demain");
  }

  // Toutes les récompenses hors bonus quotidien doivent être liées à un
  // événement métier vérifiable côté serveur. Ne jamais accepter un simple
  // actionKey fourni par le navigateur comme preuve d'une action.
  const referenceId = typeof body.referenceId === "string" ? body.referenceId.trim() : "";
  if (body.actionKey !== "daily_bonus" && !referenceId) {
    return jsonError(res, 400, "Référence d'événement requise");
  }

  const pts = Math.min(rule.pts, DAILY_EARN_CAP - earnedToday);

  try {
    const result = await rpcWallet(admin, "wallet_earn", {
      p_user_id: user.id,
      p_pts: pts,
      p_label: label,
      p_action_key: body.actionKey,
      p_daily_cap: DAILY_EARN_CAP,
      p_daily_bonus: body.actionKey === "daily_bonus",
      p_reference_id: referenceId || null,
    });
    return res.status(200).json({
      ok: true,
      balance: Number(result.balance),
      transaction: result.transaction,
      earnedToday: Number(result.earned_today),
      remainingToday: Number(result.remaining_today),
      dailyCap: DAILY_EARN_CAP,
      dailyClaimed: body.actionKey === "daily_bonus" ? true : undefined,
    });
  } catch (e) {
    if (String(e.message).includes("DAILY_BONUS_ALREADY_CLAIMED")) return jsonError(res, 429, "Bonus quotidien déjà réclamé aujourd'hui");
    if (String(e.message).includes("DAILY_CAP_REACHED")) return jsonError(res, 429, "Plafond quotidien de gains atteint, réessayez demain");
    if (String(e.message).includes("REWARD_REFERENCE_REQUIRED")) return jsonError(res, 400, "Référence d'événement requise");
    if (String(e.message).includes("REWARD_EVENT_NOT_FOUND")) return jsonError(res, 400, "Événement de récompense introuvable");
    if (String(e.message).includes("REWARD_ALREADY_CLAIMED")) return jsonError(res, 409, "Récompense déjà attribuée");
    if (String(e.message).includes("UNVERIFIABLE_REWARD_ACTION")) return jsonError(res, 400, "Action de récompense non vérifiable");
    throw e;
  }
}

async function handleRedeem(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour accéder aux récompenses");
  }

  const opt = REDEEM_OPTIONS[body.optionId];
  if (!opt) return jsonError(res, 400, "Récompense inconnue");

  if (opt.cash) {
    const check = await cashoutEligibility(admin, user);
    if (!check.ok) return jsonError(res, 403, check.reason);
  }

  try {
    const result = await rpcWallet(admin, "wallet_redeem", {
      p_user_id: user.id,
      p_cost: opt.cost,
      p_label: opt.label,
      p_action_key: `redeem_${opt.id}`,
    });
    return res.status(200).json({ ok: true, balance: Number(result.balance), transaction: result.transaction });
  } catch (e) {
    if (String(e.message).includes("INSUFFICIENT_BALANCE")) return jsonError(res, 400, "Solde insuffisant");
    throw e;
  }
}

async function handleConvert(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour convertir en BARO");
  }

  const pts = Number(body.pts);
  if (!Number.isFinite(pts) || pts <= 0 || pts % 1 !== 0) {
    return jsonError(res, 400, "Montant invalide");
  }

  const check = await cashoutEligibility(admin, user);
  if (!check.ok) return jsonError(res, 403, check.reason);

  try {
    const result = await rpcWallet(admin, "wallet_convert", {
      p_user_id: user.id,
      p_pts: pts,
      p_points_per_baro: POINTS_PER_BARO,
    });
    return res.status(200).json({ ok: true, balance: Number(result.balance), holdings: Number(result.holdings), transaction: result.transaction });
  } catch (e) {
    if (String(e.message).includes("INSUFFICIENT_BALANCE")) return jsonError(res, 400, "Solde insuffisant");
    throw e;
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée");
  }

  const limit = rateLimit(req, { key: "wallet", max: 40, windowMs: 60_000 });
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
    if (body.action === "status") return await handleStatus(admin, user, res);
    if (body.action === "earn") return await handleEarn(admin, user, body, res);
    if (body.action === "redeem") return await handleRedeem(admin, user, body, res);
    if (body.action === "convert") return await handleConvert(admin, user, body, res);
    return jsonError(res, 400, "Action inconnue");
  } catch (e) {
    console.error("Erreur /api/wallet :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
