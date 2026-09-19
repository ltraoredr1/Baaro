import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();

    // Numéro de téléphone de l'utilisateur (format E.164 : +223...)
    const phone = payload.user.phone;
    const otp = payload.sms.otp;

    const message = `Votre code de vérification BAARO est : ${otp}`;

    // Configuration InfiniReach
    const INFINIREACH_API_URL = "https://app.infinireach.io/api/v1/messages"; // Remplace par l'URL d'API officielle d'InfiniReach si différente
    const API_KEY = "TA_CLE_API_INFINIREACH"; // Récupérée depuis ton dashboard web InfiniReach
    const DEVICE_ID = "607647c5-5682-4a16-a3a0-7a03a36570cc";

    const response = await fetch(INFINIREACH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        device_id: DEVICE_ID,
        phone: phone,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      console.error("Erreur d'envoi InfiniReach :", errorDetail);
      return new Response(JSON.stringify({ error: errorDetail }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erreur Edge Function SMS :", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
