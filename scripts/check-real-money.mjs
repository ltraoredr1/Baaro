import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const migrationPath = "supabase/migrations/0001_baaro_unified.sql";
const hasMigration = fs.existsSync(path.join(root, migrationPath));
const migration = hasMigration ? read(migrationPath) : "";
if (!hasMigration) {
  console.warn("NOT VERIFIED: assertions SQL de paiements réels non exécutées (migrations volontairement absentes).");
}

const payments = read("api/payments.js");
const webhooks = read("api/webhooks.js");
const payouts = read("api/payouts.js");
const payoutWebhook = read("api/payout-webhook.js");
const adRevenue = read("api/ad-revenue.js");
const feed = read("src/features/feed/FeedTab.jsx");
const videos = read("src/features/videos/components/VideoCard.jsx");
const economy = read("src/features/economy/EconomyTab.jsx");
const tip = read("src/components/TipButton.jsx");

const requiredProducts = ["premium_monthly", "creator_subscription", "tip_100", "tip_500", "tip_1000",
  "vip_group_monthly", "pro_merchant_monthly", "cosmetics_pack_6", "ai_pack_10", "job_boost_7d",
  "api_starter_monthly", "boost_post_24h", "sponsored_poll_1000", "local_ad_2000", "credits_120",
  "live_ticket", "training_ticket", "training_replay"];

if (hasMigration) {
  for (const product of requiredProducts) {
    if (!migration.includes(`'${product}'`)) throw new Error(`Missing product ${product}`);
  }
  for (const token of ["send_tip", "start_creator_subscription_checkout", "record_ad_creator_revenue",
    "creator_payout_profiles", "PAYOUT_KYC_REQUIRED"]) {
    if (!migration.includes(token)) throw new Error(`Missing money control ${token}`);
  }
}

if (!payments.includes("minorToMajor(payment.amount, payment.currency)")) throw new Error("Stripe amount is not normalized from internal minor units");
if (!payments.includes("amount: minorToMajor(payment.amount, payment.currency)")) throw new Error("CinetPay amount is not normalized");
if (!webhooks.includes("providerMajorToMinor(session.amount_total")) throw new Error("Stripe webhook amount is not normalized");
if (!webhooks.includes("majorToMinor(parseFloat(verifyData.data.cpm_amount), 'XOF')")) throw new Error("CinetPay webhook amount is not normalized");
if (!webhooks.includes("MONTANT_PAIEMENT_INATTENDU")) throw new Error("Provider amount validation missing");
if (!payouts.includes("request_economy_payout") || !payouts.includes("cancel_economy_payout") ||
    !payoutWebhook.includes("complete_economy_payout") || !payoutWebhook.includes("cancel_economy_payout")) {
  throw new Error("Payout lifecycle not wired");
}
if (!feed.includes("<TipButton") || !videos.includes("<TipButton")) throw new Error("Tip UI missing from feed/video");
if (!tip.includes("supabase.rpc('send_tip'")) throw new Error("Tip RPC missing from UI");
if (!economy.includes("/api/payouts")) throw new Error("Economy payout UI not wired to server payout endpoint");
if (!adRevenue.includes("record_ad_creator_revenue") || !adRevenue.includes("x-baaro-ad-secret")) throw new Error("Ad revenue server bridge missing");

console.log("Real-money code contract checks passed. Deployed DB verification is separate.");
