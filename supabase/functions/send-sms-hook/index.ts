import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();

    // Récupération du numéro de téléphone et du code OTP généré par Supabase Auth
    const phone = payload.user.phone;
    const otp = payload.sms.otp;

    const message = `Votre code de vérification BAARO est : ${otp}`;

    // Paramètres de l'API InfiniReach et de ton appareil lié
    const INFINIREACH_API_URL = "https://app.infinireach.io/api/v1/messages";
    const DEVICE_ID = "607647c5-5682-4a16-a3a0-7a03a36570cc";

    // Envoi de la requête vers l'API de la passerelle Android
    const response = await fetch(INFINIREACH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
