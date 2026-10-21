import http from "node:http";
import { config } from "./lib/config.mjs";
import { processJob } from "./processor.mjs";
import { prepareLargeVideo, signLargeVideoParts, completeLargeVideo, abortLargeVideo } from "./upload.mjs";

// Origines autorisees (CORS). "*" par defaut : l'auth se fait par jeton Bearer, pas par cookie.
// Pour restreindre : BAARO_CORS_ORIGINS="https://baaro-xi.vercel.app,https://localhost,capacitor://localhost"
const ALLOWED_ORIGINS = String(process.env.BAARO_CORS_ORIGINS || "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-baaro-worker-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes("*")) headers["Access-Control-Allow-Origin"] = "*";
  else if (origin && ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function send(req, res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        req.destroy();
        reject(badRequest("Payload trop volumineux", 413));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(badRequest("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Preflight CORS : sans cette reponse, le navigateur bloque tous les appels /upload/*
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    return send(req, res, 200, { ok: true, service: "baaro-media-worker", time: new Date().toISOString() });
  }

  if (req.method === "POST" && req.url.startsWith("/upload/")) {
    try {
      const body = await readBody(req);
      const result =
        req.url === "/upload/prepare" ? await prepareLargeVideo(req, body)
        : req.url === "/upload/sign-parts" ? await signLargeVideoParts(req, body)
        : req.url === "/upload/complete" ? await completeLargeVideo(req, body)
        : req.url === "/upload/abort" ? await abortLargeVideo(req, body)
        : null;
      if (!result) return send(req, res, 404, { ok: false, error: "Not found" });
      return send(req, res, 200, { ok: true, ...result });
    } catch (error) {
      return send(req, res, error.status || 500, { ok: false, error: String(error?.message || error) });
    }
  }

  if (req.method !== "POST" || req.url !== "/process") return send(req, res, 404, { error: "Not found" });
  if (config.secret && req.headers["x-baaro-worker-secret"] !== config.secret) {
    return send(req, res, 401, { error: "Unauthorized" });
  }
  try {
    const { job } = await readBody(req);
    if (!job?.id || !job?.job_type) return send(req, res, 400, { error: "Job invalide" });
    const result = await processJob(job);
    return send(req, res, 200, { ok: true, result });
  } catch (error) {
    return send(req, res, error.status || 500, { ok: false, error: String(error?.message || error) });
  }
});

server.listen(config.port, "0.0.0.0", () => console.log(`BAARO worker listening on :${config.port}`));
