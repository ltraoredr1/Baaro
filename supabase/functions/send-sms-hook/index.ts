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
  const startTime = Date.now();

  if (req.method !== "POST") {
    return response(
      { error: { http_code: 405, message: "Méthode non autorisée." } },
      405,
    );
  }

  try {
    // 1. Lecture du payload
    const rawBody = await req.text();
    let payload;
    
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error("❌ Payload JSON invalide:", rawBody);
      return response(
        { error: { http_code: 400, message: "Payload invalide." } },
        400
      );
    }

    // 🔍 Log détaillé du payload pour débogage
    console.log("📩 Payload complet reçu de Supabase:", JSON.stringify(payload, null, 2));

    // 2. Extraction téléphone (avec fallback sur plusieurs chemins)
    let phone = 
      payload?.user?.phone || 
      payload?.phone || 
      payload?.user?.identities?.[0]?.identity_data?.phone ||
      payload?.data?.phone;
    
    // Nettoyage et formatage E.164
    if (phone) {
      phone = String(phone).replace(/[\s\-()]/g, "");
      if (!phone.startsWith("+")) {
        phone = "+" + phone;
      }
    }

    // 3. Extraction OTP (avec fallback)
    const otp = 
      payload?.sms?.otp || 
      payload?.otp || 
      payload?.data?.otp;

    console.log("📱 Téléphone extrait:", phone);
    console.log("🔢 OTP extrait:", otp);

    if (!phone || !otp) {
      console.error("❌ Données manquantes:", { phone, otp, payload_keys: Object.keys(payload) });
      return response(
        { 
          error: { http_code: 400, message: "Données invalides." },
          debug: { phone, otp, payload_keys: Object.keys(payload) }
        },
        400
      );
    }

    // 4. Vérification secrets InfiniReach
    const apiKey = Deno.env.get("INFINIREACH_API_KEY");
    const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");

    if (!apiKey || !fromPhone) {
      console.error("❌ Secrets InfiniReach manquants");
      return response(
        { error: { http_code: 500, message: "Configuration InfiniReach incomplète." } },
        500
      );
    }

    // 5. Préparation du message SMS optimisé pour l'auto-remplissage
    // Format reconnu par :
    // - iOS : "BAARO: Votre code..." déclenche la suggestion au-dessus du clavier
    // - Chrome Android : "@domaine #code" déclenche WebOTP
    // - Desktop : texte lisible pour copier-coller
    const message = 
      `BAARO: Votre code de vérification est ${otp}\n\n` +
      `@baaro-xi.vercel.app #${otp}\n\n` +
      `Ne partagez pas ce code.`;

    const externalId = `baaro-${Date.now()}`;

    console.log("📤 Envoi SMS à:", phone);

    // 6. Envoi vers InfiniReach AVEC TIMEOUT (4 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

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
