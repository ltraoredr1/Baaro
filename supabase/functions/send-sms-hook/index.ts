import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const payload = await req.json();

    // Numéro de téléphone de l'utilisateur (format E.164 : +223...)
    const phone = payload.user.phone;
    const otp = payload.sms.otp;

    const message = `Votre code de vérification BAARO est : ${otp}`;

    // Identifiants récupérés depuis votre application SMSGate
    const CLOUD_API_URL = "https://api.sms-gate.app/3rdparty/v1/message";
    const USERNAME = "JRIJQ2";
    const PASSWORD = "DOCTORMED6399plus*";

    const response = await fetch(CLOUD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa(`${USERNAME}:${PASSWORD}`),
      },
      body: JSON.stringify({
        phoneNumbers: [phone],
        textMessage: {
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      console.error("Erreur d'envoi SMSGate :", errorDetail);
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
