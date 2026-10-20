/**
 * /api/payouts — demande de retrait créateur
 *
 * CinetPay Transfer exige le token en query string (GET) — doc officielle,
 * code 706 : « le token doit être passé dans l'url, pas en POST ».
 * Mitigations : jamais logger l'URL complète, erreurs client génériques,
 * montant multiple de 5 XOF, RPC JWT pour la réservation de solde.
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyCors,
  getAdminClient,
  requireUser,
  rateLimitAsync,
} from "./_shared.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const CINETPAY_TRANSFER_TOKEN = process.env.CINETPAY_TRANSFER_TOKEN || "";
const PUBLIC_APP_URL = (
  process.env.PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  ""
)
  .replace(/\/$/, "")
  .replace(/^(?!https?:\/\/)/, "https://");

const CINETPAY_TRANSFER_BASE =
  "https://client.cinetpay.com/v1/transfer/money/send/contact";

function json(res, status, body) {
  return res.status(status).json(body);
}

function clientError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  e.safe = true;
  return e;
}

function parseDestination(raw) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    const prefix = String(d?.prefix || "").replace(/\D/g, "");
    const phone = String(d?.phone || "").replace(/\D/g, "");
    if (!prefix || prefix.length < 1 || prefix.length > 4) {
      throw new Error("prefix");
    }
    if (!phone || phone.length < 6 || phone.length > 15) {
      throw new Error("phone");
    }
    return { prefix, phone };
  } catch {
    throw clientError(
      'Destination Mobile Money invalide. Utilisez {"prefix":"223","phone":"..."}.',
      400
    );
  }
}

/** CinetPay : montant XOF multiple de 5. */
function toCinetPayAmountXof(amountMinor) {
  let xof = Math.round(Number(amountMinor) / 100);
  if (!Number.isFinite(xof) || xof <= 0) return 0;
  xof = Math.floor(xof / 5) * 5;
  return xof;
}

function mapPayoutRpcError(message) {
  const m = String(message || "");
  if (m.includes("PAYOUT_BELOW_MINIMUM")) {
    return "Le minimum de retrait n'est pas atteint.";
  }
  if (m.includes("PAYOUT_KYC_REQUIRED")) {
    return "Vérification KYC requise avant tout retrait.";
  }
  if (m.includes("INSUFFICIENT") || m.includes("BALANCE")) {
    return "Solde disponible insuffisant.";
  }
  if (m.includes("RISK") || m.includes("BLOCKED")) {
    return "Retrait temporairement bloqué pour contrôle de risque.";
  }
  if (m.includes("RATE") || m.includes("LIMIT")) {
    return "Trop de demandes de retrait. Réessayez plus tard.";
  }
  return "Demande de retrait refusée.";
}

async function startCinetPayTransfer({ payout, destination }) {
  if (!CINETPAY_TRANSFER_TOKEN) return { configured: false };

  const amountXof = toCinetPayAmountXof(payout.amount_minor);
  if (amountXof < 5) {
    throw clientError("Montant trop faible pour un transfert Mobile Money.", 400);
  }

  if (!PUBLIC_APP_URL || /localhost|127\.0\.0\.1/i.test(PUBLIC_APP_URL)) {
    throw clientError(
      "URL publique de notification non configurée pour les retraits.",
      503
    );
  }

  const clientTransactionId = `payout_${payout.id}`;
  const notifyUrl = `${PUBLIC_APP_URL}/api/payout-webhook`;
  const data = JSON.stringify([
    {
      prefix: destination.prefix,
      phone: destination.phone,
      amount: amountXof,
      client_transaction_id: clientTransactionId,
      notify_url: notifyUrl,
    },
  ]);

  // Token en GET : contrainte API CinetPay (ne pas logger cette URL).
  const url = `\( {CINETPAY_TRANSFER_BASE}?token= \){encodeURIComponent(
    CINETPAY_TRANSFER_TOKEN
  )}&lang=fr`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data }),
    });
  } catch (err) {
    console.error(
      "[payouts] CinetPay network error",
      err?.message || "fetch failed"
    );
    throw clientError("Service de retrait temporairement indisponible.", 502);
  }

  const result = await response.json().catch(() => ({}));
  const item = result?.data?.[0]?.[0] || result?.data?.[0] || null;

  if (
    !response.ok ||
    Number(result?.code) !== 0 ||
    !item ||
    Number(item.code) !== 0
  ) {
    console.error("[payouts] CinetPay transfer rejected", {
      http: response.status,
      code: result?.code,
      itemCode: item?.code,
      payout_id: payout.id,
    });
    throw clientError("Transfert Mobile Money impossible pour le moment.", 502);
  }

  return {
    configured: true,
    transaction_id: item.transaction_id,
    lot: item.lot,
    status: item.status || "pending",
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Méthode non autorisée." });
  }

  const limit = await rateLimitAsync(req, {
    key: "payouts",
    max: 3,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    Object.entries(limit.headers || {}).forEach(([k, v]) =>
      res.setHeader(k, v)
    );
    return res.status(limit.status).json(limit.body);
  }

  let admin;
  let user;
  try {
    admin = getAdminClient();
    user = await requireUser(req, admin);
  } catch (e) {
    return json(res, e.status || 401, {
      ok: false,
      error: e.message || "Non authentifié",
    });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(res, 503, {
      ok: false,
      error: "Configuration serveur incomplète.",
    });
  }

  try {
    const body = req.body || {};
    const amount = Number(body.amount);
    const method = String(body.method || "mobile_money").toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { ok: false, error: "Montant invalide." });
    }
    if (method !== "mobile_money" && method !== "bank_transfer") {
      return json(res, 400, { ok: false, error: "Méthode de retrait invalide." });
    }

    const destination =
      method === "mobile_money"
        ? parseDestination(body.destination)
        : { prefix: "", phone: "" };

    const token = String(req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      ""
    );
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const amountMinor = Math.round(amount * 100);
    const destinationToken =
      method === "mobile_money" ? JSON.stringify(destination) : "{}";

    const { data: payoutId, error: requestError } = await userClient.rpc(
      "request_economy_payout",
      {
        p_amount_minor: amountMinor,
        p_method: method,
        p_destination_token: destinationToken,
      }
    );

    if (requestError) {
      return json(res, 400, {
        ok: false,
        error: mapPayoutRpcError(requestError.message),
      });
    }

    const { data: payout, error: readError } = await admin
      .from("economy_payouts")
      .select(
        "id,user_id,amount_minor,currency,method,status,destination_token"
      )
      .eq("id", payoutId)
      .eq("user_id", user.id)
      .single();

    if (readError || !payout) {
      return json(res, 500, {
        ok: false,
        error: "Demande de retrait introuvable après réservation.",
      });
    }

    if (method === "bank_transfer") {
      await admin
        .from("economy_payouts")
        .update({
          status: "processing",
          provider: "manual_bank",
          provider_reference: `manual_${payout.id}`,
        })
        .eq("id", payout.id)
        .eq("status", "pending");

      return json(res, 202, {
        ok: true,
        payout_id: payout.id,
        status: "processing",
        message: "Virement bancaire placé en traitement sécurisé.",
      });
    }

    const transfer = await startCinetPayTransfer({ payout, destination });
    if (!transfer.configured) {
      await admin.rpc("cancel_economy_payout", {
        p_payout_id: payout.id,
        p_reason: "CINETPAY_TRANSFER_NOT_CONFIGURED",
      });
      return json(res, 503, {
        ok: false,
        error:
          "Le payout CinetPay n’est pas configuré. Aucun solde n’a été perdu.",
      });
    }

    await admin
      .from("economy_payouts")
      .update({
        status: "processing",
        provider: "cinetpay",
        provider_reference: transfer.transaction_id,
      })
      .eq("id", payout.id)
      .eq("status", "pending");

    return json(res, 202, {
      ok: true,
      payout_id: payout.id,
      status: "processing",
      provider: "cinetpay",
      transaction_id: transfer.transaction_id,
    });
  } catch (e) {
    if (e?.safe) {
      return json(res, e.status || 400, { ok: false, error: e.message });
    }
    console.error("[payouts] unexpected", e?.message || e);
    return json(res, 500, { ok: false, error: "Payout impossible." });
  }
}
