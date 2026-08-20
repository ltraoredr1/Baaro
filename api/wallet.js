import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

/**
 * BAARO /api/wallet — autorité serveur exclusive
 *
 * Flux unique :
 *   Client → action (sans montant) → serveur vérifie → RPC ledger → solde
 *
 * Le client NE PEUT PAS envoyer pts / balance / holdings à créditer.
 * Les montants viennent de reward_catalog / redeem_catalog (Postgres).
 *
 * Remplace : api/wallet.js
 */

const DAILY_EARN_CAP = 100;
const MIN_ACCOUNT_AGE_MS_FOR_CASHOUT = 3 * 24 * 60 * 60 * 1000;

/** Actions autorisées côté API (le montant reste en base). */
const ALLOWED_EARN_ACTIONS = new Set([
  "like_post",
  "publish_post",
  "publish_post_media",
  "comment",
  "watch_video",
  "subscribe",
  "like_video",
  "publish_video",
  "repost_video",
  "comment_video",
  "publish_story",
  "daily_bonus",
  // tip_video volontairement exclu tant que non vérifiable en base
]);

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isAnonymous(user) {
  return user?.is_anonymous === true;
}

/** Refuse tout champ qui ressemble à un montant décidé par le client. */
function rejectClientAmounts(body) {
  const forbidden = [
    "pts",
    "points",
    "amount",
    "balance",
    "holdings",
    "baro",
    "credit",
    "delta",
    "value",
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body.action === "earn") {
      return `Champ interdit pour earn: ${key}`;
    }
  }
  // redeem / convert : seuls optionId ou pts (quantité à convertir, pas un crédit) sont OK
  if (body.action === "redeem") {
    for (const key of ["pts", "cost", "balance", "amount"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        return `Champ interdit pour redeem: ${key}`;
      }
    }
  }
  return null;
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

async function hasClaimedDailyBonus(admin, userId) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count } = await admin
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_key", "daily_bonus")
    .gte("created_at", since.toISOString());

  return (count || 0) > 0;
}

async function rpcWallet(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function ensureWallet(admin, user) {
  // Welcome bonus uniquement pour comptes non anonymes.
  // Le montant réel est lu dans reward_catalog par wallet_ensure (SQL).
  const welcomeFlag = isAnonymous(user) ? 0 : 1;
  return rpcWallet(admin, "wallet_ensure", {
    p_user_id: user.id,
    p_welcome_bonus: welcomeFlag,
  });
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

  // Catalogue public (lecture seule) pour l'UI — montants serveur
  const { data: catalog } = await admin
    .from("reward_catalog")
    .select("action_key, pts, label")
    .eq("active", true);

  return res.status(200).json({
    ok: true,
    balance: Number(wallet.balance),
    holdings,
    earnedToday,
    dailyCap: DAILY_EARN_CAP,
    remainingToday: remaining,
    dailyClaimed,
    isAnonymous: isAnonymous(user),
    catalog: catalog || [],
  });
}

async function handleEarn(admin, user, body, res) {
  if (isAnonymous(user)) {
    const wallet = await ensureWallet(admin, user);
    return res.status(200).json({
      ok: true,
      balance: Number(wallet.balance),
      transaction: null,
      credited: 0,
      note: "Compte invité : aucun point gagné",
      earnedToday: 0,
      remainingToday: 0,
      dailyCap: DAILY_EARN_CAP,
    });
  }

  const actionKey =
    typeof body.actionKey === "string" ? body.actionKey.trim() : "";
  if (!ALLOWED_EARN_ACTIONS.has(actionKey)) {
    return jsonError(res, 400, "Action de gain inconnue ou non autorisée");
  }

  const detail =
    typeof body.detail === "string"
      ? body.detail.slice(0, 80).replace(/[\r\n]/g, " ")
      : "";

  const referenceId =
    typeof body.referenceId === "string" ? body.referenceId.trim() : "";

  if (actionKey !== "daily_bonus" && !referenceId) {
    return jsonError(res, 400, "Référence d'événement requise");
  }

  // UUID basique
  if (referenceId && !/^[0-9a-f-]{36}$/i.test(referenceId)) {
    return jsonError(res, 400, "referenceId invalide");
  }

  try {
    // AUCUN montant passé : wallet_earn_v2 lit reward_catalog
    const result = await rpcWallet(admin, "wallet_earn_v2", {
      p_user_id: user.id,
      p_action_key: actionKey,
      p_label_detail: detail,
      p_daily_cap: DAILY_EARN_CAP,
      p_reference_id: referenceId || null,
    });

    return res.status(200).json({
      ok: true,
      balance: Number(result.balance),
      credited: Number(result.credited),
      transaction: result.transaction,
      earnedToday: Number(result.earned_today),
      remainingToday: Number(result.remaining_today),
      dailyCap: DAILY_EARN_CAP,
      dailyClaimed: actionKey === "daily_bonus" ? true : undefined,
    });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("DAILY_BONUS_ALREADY_CLAIMED"))
      return jsonError(res, 429, "Bonus quotidien déjà réclamé aujourd'hui");
    if (msg.includes("DAILY_CAP_REACHED"))
      return jsonError(res, 429, "Plafond quotidien de gains atteint, réessayez demain");
    if (msg.includes("REWARD_REFERENCE_REQUIRED"))
      return jsonError(res, 400, "Référence d'événement requise");
    if (msg.includes("REWARD_EVENT_NOT_FOUND"))
      return jsonError(res, 400, "Événement de récompense introuvable");
    if (msg.includes("REWARD_ALREADY_CLAIMED"))
      return jsonError(res, 409, "Récompense déjà attribuée");
    if (msg.includes("UNVERIFIABLE_REWARD_ACTION") || msg.includes("UNKNOWN_REWARD_ACTION"))
      return jsonError(res, 400, "Action de récompense non vérifiable");
    throw e;
  }
}

async function handleRedeem(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour accéder aux récompenses");
  }

  const optionId =
    typeof body.optionId === "string" ? body.optionId.trim() : "";
  if (!optionId) return jsonError(res, 400, "optionId requis");

  // Coût lu en base via wallet_redeem_v2 — pas de cost client
  const { data: opt } = await admin
    .from("redeem_catalog")
    .select("option_id, is_cash, active")
    .eq("option_id", optionId)
    .eq("active", true)
    .maybeSingle();

  if (!opt) return jsonError(res, 400, "Récompense inconnue");

  if (opt.is_cash) {
    const check = await cashoutEligibility(admin, user);
    if (!check.ok) return jsonError(res, 403, check.reason);
  }

  try {
    const result = await rpcWallet(admin, "wallet_redeem_v2", {
      p_user_id: user.id,
      p_option_id: optionId,
    });
    return res.status(200).json({
      ok: true,
      balance: Number(result.balance),
      cost: Number(result.cost),
      transaction: result.transaction,
    });
  } catch (e) {
    if (String(e.message).includes("INSUFFICIENT_BALANCE"))
      return jsonError(res, 400, "Solde insuffisant");
    if (String(e.message).includes("UNKNOWN_REDEEM_OPTION"))
      return jsonError(res, 400, "Récompense inconnue");
    throw e;
  }
}

async function handleConvert(admin, user, body, res) {
  if (isAnonymous(user)) {
    return jsonError(res, 403, "Créez un compte pour convertir en BARO");
  }

  // pts = quantité que l'utilisateur CHOISIT de convertir (débit),
  // pas un crédit arbitraire. Le taux BARO est figé en SQL.
  const pts = Number(body.pts);
  if (!Number.isFinite(pts) || pts <= 0 || pts % 1 !== 0) {
    return jsonError(res, 400, "Montant invalide");
  }
  // Plafond anti-abus d'une seule requête
  if (pts > 1_000_000) {
    return jsonError(res, 400, "Montant trop élevé");
  }

  const check = await cashoutEligibility(admin, user);
  if (!check.ok) return jsonError(res, 403, check.reason);

  try {
    const result = await rpcWallet(admin, "wallet_convert_v2", {
      p_user_id: user.id,
      p_pts: pts,
    });
    return res.status(200).json({
      ok: true,
      balance: Number(result.balance),
      holdings: Number(result.holdings),
      baroCredited: Number(result.baro_credited),
      transaction: result.transaction,
    });
  } catch (e) {
    if (String(e.message).includes("INSUFFICIENT_BALANCE"))
      return jsonError(res, 400, "Solde insuffisant");
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
    Object.entries(limit.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
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

  const amountReject = rejectClientAmounts(body);
  if (amountReject) {
    return jsonError(res, 400, amountReject);
  }

  try {
    if (body.action === "status") return await handleStatus(admin, user, res);
    if (body.action === "earn") return await handleEarn(admin, user, body, res);
    if (body.action === "redeem")
      return await handleRedeem(admin, user, body, res);
    if (body.action === "convert")
      return await handleConvert(admin, user, body, res);
    return jsonError(res, 400, "Action inconnue");
  } catch (e) {
    console.error("Erreur /api/wallet :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
