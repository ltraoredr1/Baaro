import { getAdminClient, requireUser } from "./_supabaseAdmin.js";
import { rateLimit } from "./_rateLimit.js";
import { applyCors } from "./_cors.js";

/**
 * BAARO — Rachats cash via Stripe (squelette prêt à brancher)
 *
 * Variables Vercel requises :
 *   STRIPE_SECRET_KEY=sk_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...  (pour le webhook plus tard)
 *   PUBLIC_APP_URL=https://ton-app.vercel.app
 *
 * Flow :
 * 1. Client appelle action "create-session" avec optionId (r1 | r2)
 * 2. Serveur vérifie éligibilité + solde, réserve les points (transaction négative pending)
 * 3. Stripe Checkout Session créée → URL renvoyée au client
 * 4. Webhook (à ajouter) confirme le paiement et finalise
 *
 * Pour l'instant : si STRIPE_SECRET_KEY est absent, mode simulation
 * (débité les points + log, sans vrai paiement — utile en dev).
 */

const CASH_OPTIONS = {
  r1: { cost: 500, amountCents: 500, label: "Carte cadeau partenaire — 5 €", currency: "eur" },
  r2: { cost: 1000, amountCents: 1000, label: "Virement — 10 €", currency: "eur" },
};

const MIN_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isAnonymous(user) {
  return user?.is_anonymous === true;
}

async function getProfile(admin, userId) {
  const { data } = await admin
    .from("profiles")
    .select("created_at, restricted, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function assertCashEligible(admin, user) {
  if (isAnonymous(user)) {
    return { ok: false, reason: "Créez un compte pour les rachats cash" };
  }
  const profile = await getProfile(admin, user.id);
  if (!profile) return { ok: false, reason: "Profil introuvable" };
  if (profile.restricted) {
    return { ok: false, reason: "Compte restreint" };
  }
  const age = Date.now() - new Date(profile.created_at).getTime();
  if (age < MIN_ACCOUNT_AGE_MS) {
    return { ok: false, reason: "Compte trop récent (3 jours requis)" };
  }
  return { ok: true, profile };
}

async function getWallet(admin, userId) {
  const { data } = await admin
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function debitPoints(admin, userId, cost, label) {
  const wallet = await getWallet(admin, userId);
  if (!wallet || Number(wallet.balance) < cost) {
    return { ok: false, error: "Solde insuffisant" };
  }

  const newBalance = Number(wallet.balance) - cost;
  const { data, error } = await admin
    .from("wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("balance", wallet.balance)
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: "Conflit de solde, réessayez" };
  }

  await admin.from("transactions").insert({
    user_id: userId,
    label,
    pts: -cost,
  });

  return { ok: true, balance: newBalance };
}

async function handleCreateSession(admin, user, body, res) {
  const opt = CASH_OPTIONS[body.optionId];
  if (!opt) return jsonError(res, 400, "Option de rachat inconnue");

  const eligibility = await assertCashEligible(admin, user);
  if (!eligibility.ok) return jsonError(res, 403, eligibility.reason);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");

  // --- Mode simulation (pas de clé Stripe) ---
  if (!stripeKey) {
    const debit = await debitPoints(
      admin,
      user.id,
      opt.cost,
      `[SIMULATION] ${opt.label}`
    );
    if (!debit.ok) return jsonError(res, 400, debit.error);

    return res.status(200).json({
      ok: true,
      mode: "simulation",
      balance: debit.balance,
      message:
        "Mode simulation : points débités. Configure STRIPE_SECRET_KEY pour un vrai paiement.",
    });
  }

  // --- Mode Stripe réel ---
  // Débit points AVANT session (à compenser via webhook si abandon —
  // version pro : table pending_redemptions)
  const debit = await debitPoints(admin, user.id, opt.cost, `Réservation — ${opt.label}`);
  if (!debit.ok) return jsonError(res, 400, debit.error);

  try {
    // Import dynamique pour ne pas casser le build si stripe n'est pas installé
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: opt.currency,
            unit_amount: opt.amountCents,
            product_data: {
              name: opt.label,
              description: `Rachat BAARO — ${opt.cost} points`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl || "https://baaro.app"}/wallet?redeem=success`,
      cancel_url: `${appUrl || "https://baaro.app"}/wallet?redeem=cancel`,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        optionId: body.optionId,
        pointsCost: String(opt.cost),
      },
    });

    return res.status(200).json({
      ok: true,
      mode: "stripe",
      sessionId: session.id,
      url: session.url,
      balance: debit.balance,
    });
  } catch (e) {
    console.error("Stripe error:", e);
    // En prod : rembourser les points ici si la session échoue
    return jsonError(res, 500, "Erreur création session Stripe");
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée");
  }

  const limit = rateLimit(req, { key: "stripe-redeem", max: 10, windowMs: 60_000 });
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
    if (body.action === "create-session") {
      return await handleCreateSession(admin, user, body, res);
    }
    return jsonError(res, 400, "Action inconnue");
  } catch (e) {
    console.error("/api/stripe-redeem:", e);
    return jsonError(res, 500, "Erreur serveur");
  }
}
