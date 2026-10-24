import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// ... response() et normalizePhone() inchangés ...

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return response({ success: false, error: "Method not allowed" }, 405);
  }

  const hookSecret = (Deno.env.get("SMS_HOOK_SECRET") || "")
    .replace("v1,whsec_", "");
  if (!hookSecret) {
    return response({ success: false, error: "Service unavailable" }, 503);
  }

  const rawBody = await req.text();
  try {
    new Webhook(hookSecret).verify(rawBody, Object.fromEntries(req.headers));
  } catch {
    return response({ success: false, error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("INFINIREACH_API_KEY");
  const fromPhone = Deno.env.get("INFINIREACH_FROM_PHONE");
  if (!apiKey || !fromPhone) {
    return response({ success: false, error: "Service unavailable" }, 503);
  }

  try {
    if (!rawBody || rawBody.length > 64 * 1024) {
      return response({ success: false, error: "Invalid payload" }, 400);
    }
    // ... la suite (JSON.parse(rawBody), phone, otp, fetch) reste identique,
    // mais SANS la ligne "const rawBody = await req.text();"
