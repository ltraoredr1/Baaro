
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function response(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
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
    return response({ success: false, error: "Method not allowed" }, 405);
  }

  // Configure SMS_HOOK_SECRET as a server-side secret and send it in
  // Authorization: Bearer <secret> from the trusted webhook caller.
  const expectedSecret = Deno.env.get("SMS_HOOK_SECRET") || "";
  const authorization = req.headers.get("Authorization") || "";

  if (!expectedSecret) {
    console.error("[SMS hook] Authentication secret is not configured.");
    return response({ success: false, error: "Service unavailable" }, 503);
  }

  if (authorization !== `Bearer ${expectedSecret}`) {
    return response({ success: false, error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("INFINIREACH_API_KEY");
  const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");

  if (!apiKey || !fromPhone) {
    console.error("[SMS hook] SMS provider configuration is missing.");
    return response({ success: false, error: "Service unavailable" }, 503);
  }

  try {
    const rawBody = await req.text();

    if (!rawBody || rawBody.length > 64 * 1024) {
      return response({ success: false, error: "Invalid payload" }, 400);
    }

    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return response({ success: false, error: "Invalid JSON" }, 400);
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

    // Reject malformed values without logging user data.
    if (
      !phone ||
      !/^\+[1-9]\d{6,14}$/.test(phone) ||
      !/^\d{4,10}$/.test(otp)
    ) {
      console.warn("[SMS hook] Required fields are missing or invalid.");
      return response({ success: false, error: "Invalid SMS payload" }, 400);
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
      // Do not log the provider response body: it may contain personal data.
      console.error(
        `[SMS hook] SMS provider returned HTTP ${smsResponse.status}.`,
      );

      return response(
        { success: false, error: "SMS provider unavailable" },
        502,
      );
    }

    console.log("[SMS hook] SMS provider accepted the request.");

    return response({ success: true });
  } catch (error) {
    const timedOut =
      error instanceof Error && error.name === "TimeoutError";

    console.error(
      timedOut
        ? "[SMS hook] SMS provider request timed out."
        : "[SMS hook] Request failed.",
    );

    return response(
      { success: false, error: "SMS delivery request failed" },
      502,
    );
  }
});
