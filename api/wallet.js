import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

// ============================================================
// Configuration des gains et limites
// ============================================================

const DAILY_EARN_CAP = 100; // points max par jour et par compte
const MIN_ACCOUNT_AGE_MS_FOR_CASHOUT = 3 * 24 * 60 * 60 * 1000; // 3 jours
const POINTS_PER_BARO = 100;

// Actions de gain autorisées (le client ne peut envoyer que ces clés)
const EARN_ACTIONS = {
  // Posts
  like_post:          { pts: 2,  label: "Interaction sur une publication" },
  publish_post:       { pts: 5,  label: "Nouvelle publication" },
  publish_post_media: { pts: 8,  label: "Publication avec média" },
  comment:            { pts: 1,  label: "Commentaire ajouté" },
  watch_video:        { pts: 1,  label: "Vue générée" },
  subscribe:          { pts: 5,  label: "Abonnement activé" },

  // Vidéos (sécurisées)
  like_video:         { pts: 2,  label: "Vidéo aimée" },
  publish_video:      { pts: 25, label: "Vidéo publiée" },
  repost_video:       { pts: 5,  label: "Repost vidéo" },
  tip_video:          { pts: 5,  label: "Tip envoyé" },
  comment_video:      { pts: 2,  label: "Commentaire vidéo" },
};

// Options de rachat
// cash: true → soumis aux règles d'éligibilité (âge + restricted)
const REDEEM_OPTIONS = {
  r1: { cost: 500,  label: "Carte cadeau partenaire — 5 €",          cash: true  },
  r2: { cost: 1000, label: "Virement via Stripe Connect — 10 €",     cash: true  },
  r3: { cost: 300,  label: "Badge Créateur Premium (statut)",        cash: false },
  r4: { cost: 150,  label: "Boost de visibilité 48h",                cash: false },
};

// ============================================================
// Helpers
// ============================================================

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function getProfile(admin, userId) {
  const { data } = await admin
    .from("profiles")
    .select("created_at, restricted")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
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

// Mise à jour atomique du solde (protection contre les courses)
async function applyBalanceDelta(admin, userId, previousBalance, delta) {
  const newBalance = Number(previousBalance) + delta;

  const { data, error } = await admin
    .from("wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", previousBalance) // optimistic locking
    .select()
    .single();

  if (error || !data) return null;
  return newBalance;
}

async function cashoutEligibility(admin, user) {
  const profile = await getProfile(admin, user.id);
  if (!profile) {
    return { ok: false, reason: "Profil introuvable" };
  }
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

// ============================================================
// Handlers
// ============================================================

async function handleEarn(admin, user, body, res) {
  const rule = EARN_ACTIONS[body.actionKey];
  if (!rule) {
    return jsonError(res, 400, "Action de gain inconnue");
  }

  const detail =
    typeof body.detail === "string"
      ? body.detail.slice(0, 80).replace(/[\r\n]/g, " ")
      : "";
  const label = detail ? `${rule.label} — ${detail}` : rule.label;

  const earnedToday = await todaysEarnedTotal(admin, user.id);
  if (earnedToday >= DAILY_EARN_CAP) {
    return jsonError(res, 429, "Plafond quotidien de gains atteint, réessayez demain");
  }

  const pts = Math.min(rule.pts, DAILY_EARN_CAP - earnedToday);

  const wallet = await getOrCreateWallet(admin, user.id);
  const newBalance = await applyBalanceDelta(admin, user.id, wallet.balance, pts);

  if (newBalance === null) {
    return jsonError(res, 409, "Conflit de solde, réessayez");
  }

  const { data: tx } = await admin
    .from("transactions")
    .insert({ user_id: user.id, label, pts })
    .select()
    .single();

  return res.status(200).json({
    ok: true,
    balance: newBalance,
    transaction: tx,
  });
}

async function handleRedeem(admin, user, body, res) {
  const opt = REDEEM_OPTIONS[body.optionId];
  if (!opt) {
    return jsonError(res, 400, "Récompense inconnue");
  }

  if (opt.cash) {
    const check = await cashoutEligibility(admin, user);
    if (!check.ok) return jsonError(res, 403, check.reason);
  }

  const wallet = await getOrCreateWallet(admin, user.id);
  if (Number(wallet.balance) < opt.cost) {
    return jsonError(res, 400, "Solde insuffisant");
  }

  const newBalance = await applyBalanceDelta(
    admin,
    user.id,
    wallet.balance,
    -opt.cost
  );

  if (newBalance === null) {
    return jsonError(res, 409, "Conflit de solde, réessayez");
  }

  const { data: tx } = await admin
    .from("transactions")
    .insert({ user_id: user.id, label: opt.label, pts: -opt.cost })
    .select()
    .single();

  return res.status(200).json({
    ok: true,
    balance: newBalance,
    transaction: tx,
  });
}

async function handleConvert(admin, user, body, res) {
  const pts = Number(body.pts);
  if (!Number.isFinite(pts) || pts <= 0 || pts % 1 !== 0) {
    return jsonError(res, 400, "Montant invalide");
  }

  const check = await cashoutEligibility(admin, user);
  if (!check.ok) return jsonError(res, 403, check.reason);

  const wallet = await getOrCreateWallet(admin, user.id);
  if (Number(wallet.balance) < pts) {
    return jsonError(res, 400, "Solde insuffisant");
  }

  const baro = Number((pts / POINTS_PER_BARO).toFixed(3));
  const newBalance = await applyBalanceDelta(admin, user.id, wallet.balance, -pts);

  if (newBalance === null) {
    return jsonError(res, 409, "Conflit de solde, réessayez");
  }

  await admin.from("transactions").insert({
    user_id: user.id,
    label: `Conversion en ${baro} BARO`,
    pts: -pts,
  });

  let { data: holdingsRow } = await admin
    .from("crypto_holdings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!holdingsRow) {
    const { data: created } = await admin
      .from("crypto_holdings")
      .insert({ user_id: user.id, holdings: 0 })
      .select()
      .single();
    holdingsRow = created;
  }

  const newHoldings = Number(holdingsRow.holdings) + baro;

  await admin
    .from("crypto_holdings")
    .update({ holdings: newHoldings, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return res.status(200).json({
    ok: true,
    balance: newBalance,
    holdings: newHoldings,
  });
}

// ============================================================
// Point d'entrée
// ============================================================

export default async function handler(req, res) {
  // CORS simple (utile en local et pour Capacitor)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée");
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
    if (body.action === "earn")    return await handleEarn(admin, user, body, res);
    if (body.action === "redeem")  return await handleRedeem(admin, user, body, res);
    if (body.action === "convert") return await handleConvert(admin, user, body, res);

    return jsonError(res, 400, "Action inconnue");
  } catch (e) {
    console.error("Erreur /api/wallet :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
