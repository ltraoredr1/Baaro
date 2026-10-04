import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", "dist", "android/.gradle"]);
const patterns = [
  /sk_live_[A-Za-z0-9]+/,
  /rk_live_[A-Za-z0-9]+/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s#]+/,
  /STRIPE_SECRET_KEY\s*=\s*sk_(?:live|test)_[^\s#]+/,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/,
];
const allowed = new Set([".env.example"]);
let hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!allowed.has(path.relative(root, full))) {
      let text = "";
      try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
      for (const re of patterns) if (re.test(text)) hits.push(path.relative(root, full));
    }
  }
}
walk(root);
if (hits.length) {
  console.error("Potential secret material found:", [...new Set(hits)].join(", "));
  process.exit(1);
}
console.log("BAARO secret scan: OK");
