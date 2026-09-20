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

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response(
      { error: { http_code: 405, message: "Méthode non autorisée." } },
      405,
    );
  }

  try {
    // 1. Vérification de la signature Supabase
    const hookSecret = Deno.env
      .get("SEND_SMS_HOOK_SECRET")
      ?.replace(/^v1,whsec_/, "");

    if (!hookSecret) {
      console.error("SEND_SMS_HOOK_SECRET est manquant.");
      return response(
        { error: { http_code: 500, message: "Configuration du SMS Hook incomplète." } },
        500,
      );
    }

    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const webhook = new Webhook(hookSecret);
    const payload = webhook.verify(rawBody, headers) as AuthHookPayload;

    // 2. Nettoyage du numéro
    const rawPhone = payload?.user?.phone;
    let phone = rawPhone ? rawPhone.replace(/[\s\-()]/g, "") : null;

    if (phone && !phone.startsWith("+")) {
      phone = "+" + phone;
    }

    const otp = payload?.sms?.otp;

    if (!phone) {
      console.error("BAARO SMS Hook: numéro absent.");
      return response(
        { error: { http_code: 400, message: "Numéro de téléphone absent." } },
        400,
      );
    }

    if (!otp) {
      console.error("BAARO SMS Hook: OTP absent.");
      return response(
        { error: { http_code: 400, message: "OTP absent." } },
        400,
      );
    }

    // 3. Identifiants SMS Gateway
    const username = Deno.env.get("SMS_GATEWAY_USER");
    const password = Deno.env.get("SMS_GATEWAY_PASS");

    if (!username || !password) {
      console.error("SMS_GATEWAY_USER ou SMS_GATEWAY_PASS manquant.");
      return response(
        { error: { http_code: 500, message: "Identifiants SMS Gateway non configurés." } },
        500,
      );
    }

    // 4. Message
    const message = `Votre code de vérification BAARO est : ${otp}. Ne partagez pas ce code.`;

    console.log("BAARO - Envoi SMS via Gateway:", { to: phone });

    // 5. Envoi via SMS Gateway (Cloud API)
    const credentials = btoa(`\( {username}: \){password}`);

    const gatewayResponse = await fetch(
      "https://api.sms-gate.app/3rdparty/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          textMessage: { text: message },
          phoneNumbers: [phone],
        }),
      },
    );

    const providerText = await gatewayResponse.text();
    let providerData: unknown = null;

    try {
      providerData = providerText ? JSON.parse(providerText) : null;
    } catch {
      providerData = providerText;
    }

    // 6. Gestion d'erreur
    if (!gatewayResponse.ok) {
      console.error("BAARO - SMS Gateway erreur:", gatewayResponse.status, providerData);

      return response(
        {
          error: {
            http_code: 502,
            message: "Le SMS Gateway a refusé l'envoi.",
          },
          provider_status: gatewayResponse.status,
          provider_response: providerData,
        },
        502,
      );
    }

    // 7. Succès
    console.log("BAARO - SMS OTP envoyé avec succès via Gateway.", {
      to: phone,
      provider: providerData,
    });

    return response({
      success: true,
      message: "SMS envoyé avec succès",
    });

  } catch (error) {
    console.error("BAARO - erreur Send SMS Hook:", error);

    return response(
      {
        error: {
          http_code: 500,
          message: error instanceof Error ? error.message : "Erreur interne du SMS Hook.",
        },
      },
      500,
    );
  }
});
