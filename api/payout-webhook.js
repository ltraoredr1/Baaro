/**
 * /api/payout-webhook — notifications CinetPay Transfer
 *
 * Ne jamais faire confiance au body seul : toujours re-interroger
 * l'API CinetPay (token GET obligatoire côté provider).
 * Ne jamais logger l'URL contenant le token.
 */
import { applyCors, getAdminClient } from "./_shared.js";

const TOKEN = process.env.CINETPAY_TRANSFER_TOKEN || "";
const CHECK_BASE = "https://client.cinetpay.com/v1/transfer/check/money";

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  let raw = "";
  try {
    for await (const chunk of req) raw += chunk.toString();
  } catch {
    return {};
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(raw));
    } catch {
      return {};
    }
  }
}

function json(res, status, body) {
  return res.status(status).json(body);
}

/** Montant XOF attendu (même règle que /api/payouts : multiple de 5). */
function expectedXofFromMinor(amountMinor) {
  let xof = Math.round(Number(amountMinor) / 100);
  if (!Number.isFinite(xof) || xof <= 0) return null;
  return Math.floor(xof / 5) * 5;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // CinetPay pings en GET pour vérifier l'URL ; POST pour les notifs.
  if (req.method === "GET") {
    return json(res, 200, { ok: true });
  }
  if (req.method !== "POST") {
    return json(res, 405, { ok: false });
  }

  if (!TOKEN) {
    return json(res, 503, { ok: false, error: "Provider non configuré." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Corps invalide." });
  }

  const clientTransactionId = String(
    body.client_transaction_id || ""
  ).trim();
  const transactionId = String(body.transaction_id || "").trim();

  if (!clientTransactionId && !transactionId) {
    return json(res, 400, { ok: false, error: "Référence manquante." });
  }

  const queryKey = transactionId
    ? `transaction_id=${encodeURIComponent(transactionId)}`
    : `client_transaction_id=${encodeURIComponent(clientTransactionId)}`;

  // Token en GET = contrainte CinetPay — ne pas logger cette URL.
  let data;
  try {
    const verify = await fetch(
      `\( {CHECK_BASE}?token= \){encodeURIComponent(TOKEN)}&lang=fr&${queryKey}`,
      { headers: { Accept: "application/json" } }
    );
    data = await verify.json().catch(() => ({}));
  } catch (err) {
    console.error(
      "[payout-webhook] CinetPay check network",
      err?.message || "fetch failed"
    );
    return json(res, 502, { ok: false, error: "Vérification impossible." });
  }

  const transfer = data?.data?.[0] || null;
  if (Number(data?.code) !== 0 || !transfer) {
    console.error("[payout-webhook] transfer not found", {
      code: data?.code,
      hasTx: Boolean(transactionId),
      hasClient: Boolean(clientTransactionId),
    });
    return json(res, 400, { ok: false, error: "Transfert introuvable." });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return json(res, 500, { ok: false, error: "Configuration serveur." });
  }

  const payoutRef = String(
    transfer.client_transaction_id || clientTransactionId
  );
  const payoutId = payoutRef.startsWith("payout_")
    ? payoutRef.slice("payout_".length)
    : null;

  if (!payoutId) {
    return json(res, 400, { ok: false, error: "Référence BAARO invalide." });
  }

  const { data: payout, error: payoutError } = await admin
    .from("economy_payouts")
    .select("id, amount_minor, currency, status")
    .eq("id", payoutId)
    .maybeSingle();

  if (payoutError || !payout) {
    return json(res, 404, { ok: false, error: "Payout introuvable." });
  }

  // Déjà finalisé → idempotent
  if (payout.status === "paid" || payout.status === "cancelled") {
    return json(res, 200, { ok: true, status: payout.status, idempotent: true });
  }

  const expected = expectedXofFromMinor(payout.amount_minor);
  const paid = Number(transfer.amount);

  if (
    expected == null ||
    !Number.isFinite(paid) ||
    paid !== expected
  ) {
    console.error("[payout-webhook] amount mismatch", {
      payout_id: payout.id,
      expected,
      paid,
    });
    return json(res, 400, { ok: false, error: "Montant inattendu." });
  }

  const status = String(transfer.treatment_status || "").toUpperCase();
  const validFlag = String(transfer.transfer_valid || "").toUpperCase();

  if (
    ["VAL", "SUCCESS", "SUCCESSFUL"].includes(status) ||
    validFlag === "Y"
  ) {
    const { error } = await admin.rpc("complete_economy_payout", {
      p_payout_id: payout.id,
      p_provider: "cinetpay",
      p_provider_reference: String(
        transfer.transaction_id || payoutRef
      ),
    });
    if (error) {
      console.error("[payout-webhook] complete rpc", error.message);
      return json(res, 500, { ok: false, error: "Finalisation impossible." });
    }
    return json(res, 200, { ok: true, status: "paid" });
  }

  if (["REJ", "REJECTED", "CANCELLED", "FAILED", "FAIL"].includes(status)) {
    const reason = String(transfer.comment || status).slice(0, 500);
    const { error } = await admin.rpc("cancel_economy_payout", {
      p_payout_id: payout.id,
      p_reason: reason,
    });
    if (error) {
      console.error("[payout-webhook] cancel rpc", error.message);
      return json(res, 500, { ok: false, error: "Annulation impossible." });
    }
    return json(res, 200, { ok: true, status: "cancelled" });
  }

  await admin
    .from("economy_payouts")
    .update({
      status: "processing",
      provider: "cinetpay",
      provider_reference: String(transfer.transaction_id || payoutRef),
    })
    .eq("id", payout.id)
    .in("status", ["pending", "processing"]);

  return json(res, 200, { ok: true, status: "processing" });
}
