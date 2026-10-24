import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

// Succès : Supabase attend un 200 avec un JSON (vide).
function ok(): Response {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: jsonHeaders,
  });
}

// Erreur : format lu par Supabase Auth.
function fail(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: { http_code: status, message } }),
    { status, headers: jsonHeaders },
  );
}

function normalizePhone(value: unknown): string {
  let phone = String(value || "").replace(/[\s\-().]/g, "");

  if (phone && !phone.startsWith("+")) {
    phone = `+${phone}`;
  }

  return phone;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  // Secret généré par Supabase (Authentication > Hooks > Send SMS).
  // Format : v1,whsec_xxxxx
  const hookSecret = (Deno.env.get("SMS_HOOK_SECRET") || "").replace(
    "v1,whsec_",
    "",
  );

  if (!hookSecret) {
    console.error("[SMS hook] SMS_HOOK_SECRET is not configured.");
    return fail("Service unavailable", 503);
  }

  const apiKey = Deno.env.get("INFINIREACH_API_KEY");
  const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");

  if (!apiKey || !fromPhone) {
    console.error("[SMS hook] SMS provider configuration is missing.");
    return fail("Service unavailable", 503);
  }

  try {
    const rawBody = await req.text();

    if (!rawBody || rawBody.length > 64 * 1024) {
      return fail("Invalid payload", 400);
    }

    // Vérifie la signature Standard Webhooks envoyée par Supabase.
    let payload: any;

    try {
      payload = new Webhook(hookSecret).verify(
        rawBody,
        Object.fromEntries(req.headers),
      );
    } catch {
      console.warn("[SMS hook] Invalid webhook signature.");
      return fail("Unauthorized", 401);
    }

    const rawPhone =
      payload?.user?.phone ||
      payload?.phone ||
      payload?.user?.identities?.[0]?.identity_data?.phone ||
      payload?.data?.phone;

    const phone = normalizePhone(rawPhone);

    const rawOtp =
      payload?.sms?.otp ||
      payload?.otp ||
      payload?.data?.otp;

    const otp = String(rawOtp || "").trim();

    // Rejette les valeurs invalides sans journaliser de données personnelles.
    if (
      !phone ||
      !/^\+[1-9]\d{6,14}$/.test(phone) ||
      !/^\d{4,10}$/.test(otp)
    ) {
      console.warn("[SMS hook] Required fields are missing or invalid.");
      return fail("Invalid SMS payload", 400);
    }

    const message =
      `BAARO: Votre code de vérification est ${otp}\n\n` +
      `@baaro-xi.vercel.app #${otp}\n\n` +
      `Ne partagez pas ce code.`;

    const smsResponse = await fetch(
      "https://api.infinireach.io/api/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          to: phone,
          message,
          from: fromPhone,
          channel: "sms",
          externalId: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!smsResponse.ok) {
      // Ne journalise pas le corps de la réponse : il peut contenir des données personnelles.
      console.error(
        `[SMS hook] SMS provider returned HTTP ${smsResponse.status}.`,
      );
      return fail("SMS provider unavailable", 502);
    }

    console.log("[SMS hook] SMS provider accepted the request.");

    return ok();
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      timedOut
        ? "[SMS hook] SMS provider request timed out."
        : "[SMS hook] Request failed.",
    );

    return fail("SMS delivery request failed", 502);
  }
});
