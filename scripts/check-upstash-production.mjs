const isProduction =
  process.env.VERCEL_ENV === "production" ||
  process.env.NODE_ENV === "production" ||
  process.env.CI_PRODUCTION === "1";

if (!isProduction) {
  console.log("Upstash production check: skipped (non-production context)");
  process.exit(0);
}

const required = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length) {
  console.error(`FAIL: Upstash Redis is mandatory in production. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

if (!/^https:\/\//.test(process.env.UPSTASH_REDIS_REST_URL)) {
  console.error("FAIL: UPSTASH_REDIS_REST_URL must use HTTPS.");
  process.exit(1);
}

console.log("Upstash production check: OK");
