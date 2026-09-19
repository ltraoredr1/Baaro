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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response(
      {
        error: {
          http_code: 405,
          message: "Méthode non autorisée.",
        },
      },
      405,
    );
  }

  try {
    /*
     * ---------------------------------------------------------
     * 1. Vérification de la signature Supabase Auth Hook
     * ---------------------------------------------------------
     */

    const hookSecret = Deno.env
      .get("SEND_SMS_HOOK_SECRET")
      ?.replace(/^v1,whsec_/, "");

    if (!hookSecret) {
      console.error(
        "SEND_SMS_HOOK_SECRET est manquant.",
      );

      return response(
        {
          error: {
            http_code: 500,
            message:
              "Configuration du SMS Hook incomplète.",
          },
        },
        500,
      );
    }

    const rawBody = await req.text();

    const headers = Object.fromEntries(
      req.headers.entries(),
    );

    const webhook = new Webhook(hookSecret);

    const payload =
      webhook.verify(
        rawBody,
        headers,
      ) as AuthHookPayload;

    /*
     * ---------------------------------------------------------
     * 2. Récupération du téléphone et du code OTP
     * ---------------------------------------------------------
     */

    // Nettoyage du numéro : suppression des espaces et tirets
    const rawPhone = payload?.user?.phone;
    const phone = rawPhone ? rawPhone.replace(/[\s-]/g, "") : null;
    
    const otp = payload?.sms?.otp;

    if (!phone) {
      console.error(
        "BAARO SMS Hook: numéro absent.",
      );

      return response(
        {
          error: {
            http_code: 400,
            message:
              "Numéro de téléphone absent.",
          },
        },
        400,
      );
    }

    if (!phone.startsWith("+")) {
      console.error(
        "BAARO SMS Hook: format de numéro invalide.",
        rawPhone,
      );

      return response(
        {
          error: {
            http_code: 400,
            message:
              "Format de numéro invalide. Utilisez le format E.164 (ex: +223...).",
          },
        },
        400,
      );
    }

    if (!otp) {
      console.error(
        "BAARO SMS Hook: OTP absent.",
      );

      return response(
        {
          error: {
            http_code: 400,
            message: "OTP absent.",
          },
        },
        400,
      );
    }

    /*
     * ---------------------------------------------------------
     * 3. Secrets InfiniReach
     * ---------------------------------------------------------
     */

    const apiKey = Deno.env.get(
      "INFINIREACH_API_KEY",
    );

    const fromPhone = Deno.env.get(
      "INFINIREACH_FROM_PHONE",
    );

    if (!apiKey) {
      console.error(
        "INFINIREACH_API_KEY est manquant.",
      );

      return response(
        {
          error: {
            http_code: 500,
            message:
              "Clé API InfiniReach non configurée.",
          },
        },
        500,
      );
    }

    if (!fromPhone) {
      console.error(
        "INFINIREACH_FROM_PHONE est manquant.",
      );

      return response(
        {
          error: {
            http_code: 500,
            message:
              "Numéro expéditeur InfiniReach non configuré.",
          },
        },
        500,
      );
    }

    /*
     * ---------------------------------------------------------
     * 4. Message SMS
     * ---------------------------------------------------------
     */

    const message =
      `Votre code de vérification BAARO est : ${otp}. Ne partagez pas ce code.`;

    /*
     * ---------------------------------------------------------
     * 5. Envoi vers InfiniReach
     * ---------------------------------------------------------
     */

    const externalId =
      `baaro-otp-${crypto.randomUUID()}`;

    console.log(
      "BAARO - Envoi SMS en cours:",
      {
        to: phone,
        from: fromPhone,
        externalId,
      },
    );

    const infinireachResponse =
      await fetch(
        "https://api.infinireach.io/api/v1/messages",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            "X-API-Key": apiKey,
          },

          body: JSON.stringify({
            to: phone,
            message,
            from: fromPhone,
            channel: "sms",
            externalId,
          }),
        },
      );

    const providerText =
      await infinireachResponse.text();

    let providerData: unknown = null;

    try {
      providerData =
        providerText
          ? JSON.parse(providerText)
          : null;
    } catch {
      providerData = providerText;
    }

    /*
     * ---------------------------------------------------------
     * 6. Gestion erreur InfiniReach
     * ---------------------------------------------------------
     */

    if (!infinireachResponse.ok) {
      console.error(
        "BAARO - InfiniReach erreur:",
        infinireachResponse.status,
        providerData,
      );

      return response(
        {
          error: {
            http_code: 502,
            message:
              "Le fournisseur SMS a refusé l'envoi.",
          },
          provider_status:
            infinireachResponse.status,
          provider_response: providerData,
        },
        502,
      );
    }

    /*
     * ---------------------------------------------------------
     * 7. Succès
     * ---------------------------------------------------------
     */

    console.log(
      "BAARO - SMS OTP envoyé avec succès.",
      {
        to: phone,
        provider: providerData,
      },
    );

    return response({
      success: true,
      message: "SMS envoyé avec succès",
    });
  } catch (error) {
    console.error(
      "BAARO - erreur Send SMS Hook:",
      error,
    );

    return response(
      {
        error: {
          http_code: 500,
          message:
            error instanceof Error
              ? error.message
              : "Erreur interne du SMS Hook.",
        },
      },
      500,
    );
  }
});
