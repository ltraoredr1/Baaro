import { getAdminClient, requireUser } from "./_supabaseAdmin.js";

// Tout ce qui touche à l'argent (points, BARO) est décidé ICI, jamais par
// une valeur envoyée depuis le navigateur. Le client indique seulement
// "quelle action" a eu lieu ; le montant vient toujours de ces tables.

const DAILY_EARN_CAP = 100; // points gagnables par jour et par compte
const MIN_ACCOUNT_AGE_MS_FOR_CASHOUT = 3 * 24 * 60 * 60 * 1000; // 3 jours
const POINTS_PER_BARO = 100;

const EARN_ACTIONS = {
  like_post: { pts: 2, label: "Interaction sur une publication" },
  publish_post: { pts: 5, label: "Nouvelle publication" },
  publish_post_media: { pts: 8, label: "Publication avec média" },
  watch_video: { pts: 1, label: "Vue générée" },
  subscribe: { pts: 5, label: "Abonnement activé" },
};

// cash: true => valeur réelle (argent, crypto) => soumis à cashoutEligibility.
const REDEEM_OPTIONS = {
  r1: { cost: 500, label: "Carte cadeau partenaire — 5 €", cash: true },
  r2: { cost: 1000, label: "Virement via Stripe Connect — 10 €", cash: true },
  r3: { cost: 300, label: "Badge Créateur Premium (statut, pas d'argent)", cash: false },
  r4: { cost: 150, label: "Boost de visibilité 48h", cash: false },
};

function jsonError(res, status, message) {
  res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée");

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
    if (body.action === "earn") return await handleEarn(admin, user, body, res);
    if (body.action === "redeem") return await handleRedeem(admin, user, body, res);
    if (body.action === "convert") return await handleConvert(admin, user, body, res);
    return jsonError(res, 400, "Action inconnue");
  } catch (e) {
    console.error("Erreur /api/wallet :", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}

async function getProfile(admin, userId) {
  const { data } = await admin.from("profiles").select("created_at, restricted").eq("user_id", userId).single();
  return data;
}

async function getOrCreateWallet(admin, userId) {
  let { data: wallet } = await admin.from("wallets").select("*").eq("user_id", userId).single();
  if (!wallet) {
    const { data: created } = await admin.from("wallets").insert({ user_id: userId, balance: 1284 }).select().single();
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

// Écriture protégée contre les doubles dépenses : on ne met à jour la ligne
// que si le solde n'a pas bougé depuis la lecture. Si une autre requête a
// déjà modifié le solde entre-temps, .single() échoue et on renvoie un
// conflit plutôt que d'écraser une valeur devenue obsolète.
async function applyBalanceDelta(admin, userId, previousBalance, delta) {
  const newBalance = Number(previousBalance) + delta;
  const { data, error } = await admin
    .from("wallets")
    .update({ balance: newBalance })
    .eq("user_id", userId)
    .eq("balance", previousBalance)
    .select()
    .single();
  if (error || !data) return null;
  return newBalance;
}

async function handleEarn(admin, user, body, res) {
  const rule = EARN_ACTIONS[body.actionKey];
  if (!rule) return jsonError(res, 400, "Action de gain inconnue");

  // Détail purement cosmétique (titre de vidéo, nom d'offre) — n'influence
  // jamais le montant, qui vient uniquement de EARN_ACTIONS ci-dessus.
  const detail = typeof body.detail === "string" ? body.detail.slice(0, 80).replace(/[\r\n]/g, " ") : "";
  const label = detail ? `${rule.label} — ${detail}` : rule.label;

  const earnedToday = await todaysEarnedTotal(admin, user.id);
  if (earnedToday >= DAILY_EARN_CAP) {
    return jsonError(res, 429, "Plafond quotidien de gains atteint, réessayez demain");
  }
  const pts = Math.min(rule.pts, DAILY_EARN_CAP - earnedToday);

  const wallet = await getOrCreateWallet(admin, user.id);
  const newBalance = await applyBalanceDelta(admin, user.id, wallet.balance, pts);
  if (newBalance === null) return jsonError(res, 409, "Conflit, réessayez");

  const { data: tx } = await admin.from("transactions").insert({ user_id: user.id, label, pts }).select().single();
  res.status(200).json({ ok: true, balance: newBalance, transaction: tx });
}

async function handleRedeem(admin, user, body, res) {
  const opt = REDEEM_OPTIONS[body.optionId];
  if (!opt) return jsonError(res, 400, "Récompense inconnue");

  if (opt.cash) {
    const check = await cashoutEligibility(admin, user);
    if (!check.ok) return jsonError(res, 403, check.reason);
  }

  const wallet = await getOrCreateWallet(admin, user.id);
  if (Number(wallet.balance) < opt.cost) return jsonError(res, 400, "Solde insuffisant");

  const newBalance = await applyBalanceDelta(admin, user.id, wallet.balance, -opt.cost);
  if (newBalance === null) return jsonError(res, 409, "Conflit, réessayez");

  const { data: tx } = await admin
    .from("transactions")
    .insert({ user_id: user.id, label: opt.label, pts: -opt.cost })
    .select()
    .single();
  res.status(200).json({ ok: true, balance: newBalance, transaction: tx });
}

async function handleConvert(admin, user, body, res) {
  const pts = Number(body.pts);
  if (!Number.isFinite(pts) || pts <= 0 || pts % 1 !== 0) {
    return jsonError(res, 400, "Montant invalide");
  }

  const check = await cashoutEligibility(admin, user);
  if (!check.ok) return jsonError(res, 403, check.reason);

  const wallet = await getOrCreateWallet(admin, user.id);
  if (Number(wallet.balance) < pts) return jsonError(res, 400, "Solde insuffisant");

  const baro = Number((pts / POINTS_PER_BARO).toFixed(3));
  const newBalance = await applyBalanceDelta(admin, user.id, wallet.balance, -pts);
  if (newBalance === null) return jsonError(res, 409, "Conflit, réessayez");

  await admin.from("transactions").insert({ user_id: user.id, label: `Conversion en ${baro} BARO`, pts: -pts });

  let { data: holdingsRow } = await admin.from("crypto_holdings").select("*").eq("user_id", user.id).single();
  if (!holdingsRow) {
    const { data: created } = await admin.from("crypto_holdings").insert({ user_id: user.id, holdings: 0 }).select().single();
    holdingsRow = created;
  }
  const newHoldings = Number(holdingsRow.holdings) + baro;
  await admin.from("crypto_holdings").update({ holdings: newHoldings }).eq("user_id", user.id);

  res.status(200).json({ ok: true, balance: newBalance, holdings: newHoldings });
}

async function cashoutEligibility(admin, user) {
  const profile = await getProfile(admin, user.id);
  if (!profile) return { ok: false, reason: "Profil introuvable" };
  if (profile.restricted) {
    return { ok: false, reason: "Compte restreint (plusieurs comptes détectés sur cet appareil) — rachats à valeur réelle indisponibles" };
  }
  const ageMs = Date.now() - new Date(profile.created_at).getTime();
  if (ageMs < MIN_ACCOUNT_AGE_MS_FOR_CASHOUT) {
    return { ok: false, reason: "Compte trop récent (3 jours d'ancienneté requis pour les rachats à valeur réelle)" };
  }
  return { ok: true };
}
