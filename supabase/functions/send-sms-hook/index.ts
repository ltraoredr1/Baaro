import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

type AuthHookPayload = {
  user?: {
    id?: string;
    phone?: string;
  };
  sms?: {
    otp?: string;
  };
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

function response(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: jsonHeaders,
    },
  );
}

// Fonction avec timeout pour éviter les blocages
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 3000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method !== "POST") {
    return response(
      { error: { http_code: 405, message: "Méthode non autorisée." } },
      405,
    );
  }

  try {
    // 1. Vérification signature (rapide)
    const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.replace(/^v1,whsec_/, "");
    if (!hookSecret) {
      console.error("SEND_SMS_HOOK_SECRET manquant");
      return response({ error: { http_code: 500, message: "Configuration incomplète." } }, 500);
    }

    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const webhook = new Webhook(hookSecret);
    const payload = webhook.verify(rawBody, headers) as AuthHookPayload;

    // 2. Extraction et nettoyage téléphone
    const rawPhone = payload?.user?.phone;
    let phone = rawPhone ? rawPhone.replace(/[\s\-()]/g, "") : null;
    if (phone && !phone.startsWith("+")) {
      phone = "+" + phone;
    }
    const otp = payload?.sms?.otp;

    if (!phone || !otp) {
      console.error("Numéro ou OTP manquant");
      return response({ error: { http_code: 400, message: "Données invalides." } }, 400);
    }

    // 3. Vérification secrets InfiniReach
    const apiKey = Deno.env.get("INFINIREACH_API_KEY");
    const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");

    if (!apiKey || !fromPhone) {
      console.error("Secrets InfiniReach manquants");
      return response({ error: { http_code: 500, message: "Configuration InfiniReach incomplète." } }, 500);
    }

    // 4. Préparation message
    const message = `Votre code BAARO: ${otp}`;
    const externalId = `baaro-${Date.now()}`;

    console.log("📤 Envoi SMS à:", phone);

    // 5. Envoi vers InfiniReach AVEC TIMEOUT (3 secondes max)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const infinireachResponse = await fetch(
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
            externalId,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      if (!infinireachResponse.ok) {
        const errorText = await infinireachResponse.text();
        console.error("❌ InfiniReach erreur:", infinireachResponse.status, errorText);
        return response(
          {
            error: { http_code: 502, message: "Échec envoi SMS." },
            provider_status: infinireachResponse.status,
          },
          502,
        );
      }

      console.log("✅ SMS envoyé en", elapsed, "ms");
      return response({ success: true, message: "SMS envoyé" });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error("⏱️ Timeout ou erreur réseau InfiniReach:", fetchError);
      return response(
        {
          error: { http_code: 504, message: "Délai d'envoi dépassé. Réessayez." },
        },
        504,
      );
    }

  } catch (error) {
    console.error("💥 Erreur hook:", error);
    return response(
      { error: { http_code: 500, message: error instanceof Error ? error.message : "Erreur interne." } },
      500,
    );
  }
});
