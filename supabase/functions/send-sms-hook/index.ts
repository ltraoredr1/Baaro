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
    return response({ success: true });
  }

  try {
    const rawBody = await req.text();
    let payload: any = {};

    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("Payload JSON invalide");
    }

    let phone =
      payload?.user?.phone ||
      payload?.phone ||
      payload?.user?.identities?.[0]?.identity_data?.phone ||
      payload?.data?.phone;

    if (phone) {
      phone = String(phone).replace(/[\s\-()]/g, "");
      if (!phone.startsWith("+")) {
        phone = "+" + phone;
      }
    }

    const otp =
      payload?.sms?.otp ||
      payload?.otp ||
      payload?.data?.otp;

    console.log("Phone:", phone, "| OTP:", otp);

    if (phone && otp) {
      const apiKey = Deno.env.get("INFINIREACH_API_KEY");
      const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");

      if (apiKey && fromPhone) {
        const message =
          `BAARO: Votre code de vérification est ${otp}\n\n` +
          `@baaro-xi.vercel.app #${otp}\n\n` +
          `Ne partagez pas ce code.`;

        fetch("https://api.infinireach.io/api/v1/messages", {
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
            externalId: `baaro-${Date.now()}`,
          }),
        }).catch((err) => {
          console.error("Erreur envoi SMS:", err);
        });
      } else {
        console.error("Secrets InfiniReach manquants");
      }
    } else {
      console.error("Téléphone ou OTP manquant");
    }

    return response({ success: true });

  } catch (error) {
    console.error("Erreur inattendue:", error);
    return response({ success: true });
  }
});
