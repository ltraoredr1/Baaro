import crypto from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY,
    BAARO_PYTHON_URL,
    BAARO_PYTHON_SECRET
  } = process.env;

  if (!SUPABASE_URL || !(VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY)
      || !BAARO_PYTHON_URL || !BAARO_PYTHON_SECRET) {
    return res.status(503).json({ error: "Python service unavailable" });
  }

  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
        Authorization: authorization
      }
    });

    if (!auth.ok) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const body = JSON.stringify(req.body || {});
    if (Buffer.byteLength(body) > 25000) {
      return res.status(413).json({ error: "Payload too large" });
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac("sha256", BAARO_PYTHON_SECRET)
      .update(timestamp + "." + body)
      .digest("hex");

    const response = await fetch(
      `${BAARO_PYTHON_URL.replace(/\/$/, "")}/v1/process`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BAARO-Timestamp": timestamp,
          "X-BAARO-Signature": signature
        },
        body,
        signal: AbortSignal.timeout(20000)
      }
    );

    const result = await response.json();
    return res.status(response.status).json(result);

  } catch {
    return res.status(502).json({ error: "Python processing failed" });
  }
}
