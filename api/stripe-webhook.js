/**
 * /api/stripe-webhook
 * Vérifie la signature Stripe, puis active l'abonnement boutique (même RPC).
 *
 * Vercel : désactiver le body parser JSON pour cette route si besoin —
 * pour signature, on utilise le body brut. Sur Vercel serverless,
 * configurer dans le dashboard ou lire req.body si déjà parsé en mode test.
 */
import { getAdminClient } from "./_supabaseAdmin.js";
import crypto from "node:crypto";

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Vérification simplifiée signature Stripe (v1).
 * En production, préférer le SDK stripe.webhooks.constructEvent.
 */
function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const signed = `${t}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signed, "utf8")
    .digest("hex");
  return timingSafeEqual(expected, v1);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  // Body : string brut si possible
  const raw =
    typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body || {});

  if (secret && sig) {
    const ok = verifyStripeSignature(raw, sig, secret);
    if (!ok) {
      return res.status(400).json({ error: "Signature Stripe invalide" });
    }
  } else if (process.env.VITE_APP_ENV === "production" || process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET requis en production" });
  }

  let event;
  try {
    event = typeof req.body === "object" && req.body?.type ? req.body : JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "JSON invalide" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ ok: true, ignored: event.type });
  }

  const session = event.data?.object || {};
  const payment_ref =
    session.client_reference_id ||
    session.metadata?.payment_ref;

  if (!payment_ref) {
    return res.status(200).json({ ok: true, note: "pas de payment_ref" });
  }

  if (session.payment_status && session.payment_status !== "paid") {
    return res.status(200).json({ ok: true, note: "non payé" });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    console.error(e.message);
    return res.status(500).json({ error: "config" });
  }

  const { data: sub } = await admin
    .from("shop_subscriptions")
    .select("shop_id, amount, currency, was_premium_rate, status")
    .eq("payment_ref", payment_ref)
    .maybeSingle();

  if (sub && sub.status === "pending") {
    await admin.rpc("activate_shop_subscription", {
      p_shop_id: sub.shop_id,
      p_payment_ref: payment_ref,
      p_amount: sub.amount,
      p_currency: sub.currency,
      p_provider: "stripe",
      p_was_premium: sub.was_premium_rate,
    });
  }

  return res.status(200).json({ ok: true });
}
