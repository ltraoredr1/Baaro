import http from "node:http";
import { config } from "./lib/config.mjs";
import { processJob } from "./processor.mjs";
import { prepareLargeVideo, signLargeVideoParts, completeLargeVideo, abortLargeVideo } from "./upload.mjs";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; if (data.length > 2_000_000) { req.destroy(); reject(new Error("Payload trop volumineux")); } });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("JSON invalide")); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, service: "baaro-media-worker", time: new Date().toISOString() });
  if (req.method === "POST" && req.url.startsWith("/upload/")) {
    try {
      const body = await readBody(req);
      const result = req.url === "/upload/prepare" ? await prepareLargeVideo(req, body)
        : req.url === "/upload/sign-parts" ? await signLargeVideoParts(req, body)
        : req.url === "/upload/complete" ? await completeLargeVideo(req, body)
        : req.url === "/upload/abort" ? await abortLargeVideo(req, body)
        : null;
      if (!result) return send(res, 404, { error: "Not found" });
      return send(res, 200, { ok: true, ...result });
    } catch (error) { return send(res, error.status || 500, { ok: false, error: String(error?.message || error) }); }
  }
  if (req.method !== "POST" || req.url !== "/process") return send(res, 404, { error: "Not found" });
  if (config.secret && req.headers["x-baaro-worker-secret"] !== config.secret) return send(res, 401, { error: "Unauthorized" });
  try {
    const { job } = await readBody(req);
    if (!job?.id || !job?.job_type) return send(res, 400, { error: "Job invalide" });
    const result = await processJob(job);
    return send(res, 200, { ok: true, result });
  } catch (error) {
    return send(res, 500, { ok: false, error: String(error?.message || error) });
  }
});
server.listen(config.port, "0.0.0.0", () => console.log(`BAARO worker listening on :${config.port}`));
