import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/lib/securityHardening.js",
  "vercel.json",
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing security file: ${file}`);
}

const apiDir = path.join(root, "api");
const apiFiles = fs.existsSync(apiDir)
  ? fs.readdirSync(apiDir).filter((f) => f.endsWith(".js"))
  : [];
if (!apiFiles.length) throw new Error("API directory missing");

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const headers = vercel.headers || [];
const text = JSON.stringify(headers);
for (const requiredHeader of [
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Content-Security-Policy",
]) {
  if (!text.includes(requiredHeader)) throw new Error(`Missing security header: ${requiredHeader}`);
}

const csp = headers.flatMap((h) => h.headers || []).find((h) => h.key === "Content-Security-Policy")?.value || "";
for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "worker-src 'self' blob:"]) {
  if (!csp.includes(directive)) throw new Error(`CSP missing directive: ${directive}`);
}
if (csp.includes("script-src 'self' 'unsafe-eval'")) throw new Error("CSP must not allow unsafe-eval");

const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/0001_baaro_unified.sql"),
  "utf8"
);
for (const marker of [
  "security_devices",
  "security_events",
  "security_settings",
  "revoke all on public.security_events",
  "revoke all on public.observability_events",
]) {
  if (!migration.includes(marker)) throw new Error(`Missing hardening control: ${marker}`);
}

console.log(`BAARO Security Hardening: OK (${apiFiles.length} API files preserved)`);
