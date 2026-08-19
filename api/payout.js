import { requireUser } from "./_auth.js";
import { applyCors, handleOptions } from "./_cors.js";
import { rateLimit } from "./_rateLimit.js";
import { supabaseAdmin } from "./_supabaseAdmin.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const user = await requireUser(req);
    const limited = await rateLimit(`payout:${user.id}`, 3, 60);
    if (!limited.ok) return res.status(429).json({ error: "rate_limited" });

    // Payouts remain disabled until Stripe Connect onboarding, KYC/risk checks,
    // exchange-rate configuration, and verified webhooks are installed.
    return res.status(503).json({
      error: "payout_unavailable",
      message: "Les retraits seront activés après configuration et validation du prestataire."
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "internal_error" });
  }
}
