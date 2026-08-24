/**
 * /api/payment-webhook — notify_url CinetPay
 * Ne fait jamais confiance au body seul : recheck API CinetPay.
 * Utilise getAdminClient (même env que le reste de l'API).
 */
import { getAdminClient } from "./_supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payment_ref =
    req.body?.cpm_trans_id ||
    req.body?.payment_ref ||
    req.body?.transaction_id;

  if (!payment_ref) {
    return res.status(400).json({ error: "payment_ref manquant" });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (e) {
    console.error("payment-webhook admin:", e.message);
    return res.status(500).json({ error: "config" });
  }

  if (!process.env.CINETPAY_API_KEY || !process.env.CINETPAY_SITE_ID) {
    return res.status(500).json({ error: "CinetPay non configuré" });
  }

  const statusRes = await fetch(
    "https://api-checkout.cinetpay.com/v2/payment/check",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: process.env.CINETPAY_API_KEY,
        site_id: process.env.CINETPAY_SITE_ID,
        transaction_id: payment_ref,
      }),
    }
  );
  const statusData = await statusRes.json().catch(() => ({}));

  if (statusData.data?.status !== "ACCEPTED") {
    await admin
      .from("shop_subscriptions")
      .update({ status: "failed" })
      .eq("payment_ref", payment_ref)
      .eq("status", "pending");
    // 200 pour stopper les retries CinetPay
    return res.status(200).json({ ok: true });
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
      p_provider: "cinetpay",
      p_was_premium: sub.was_premium_rate,
    });
  }

  return res.status(200).json({ ok: true });
}
