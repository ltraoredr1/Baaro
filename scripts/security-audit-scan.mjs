import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [];
const findings = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);

    if (
      ent.name === "node_modules" ||
      ent.name === ".git" ||
      ent.name === "dist"
    ) {
      continue;
    }

    if (ent.isDirectory()) {
      walk(p);
    } else {
      files.push(p);
    }
  }
}

walk(root);

const textFiles = files.filter((file) =>
  /\.(js|mjs|jsx|ts|tsx|sql|json|html|kt|md)$/.test(file)
);

for (const file of textFiles) {
  let text;

  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    findings.push(`${path.relative(root, file)}: unable to read file`);
    continue;
  }

  const rel = path.relative(root, file);

  const checks = [
    [/service_role/i, "possible service_role reference"],
    [/SUPABASE_SERVICE_ROLE_KEY/i, "service-role secret reference"],
    [/sk-[A-Za-z0-9]{20,}/, "possible hard-coded API key"],
    [
      /Access-Control-Allow-Origin['"`]\s*:\s*['"`]\*['"`]/i,
      "wildcard CORS",
    ],
    [
      /getPublicUrl\s*\(/,
      "public URL generation; review for private buckets",
    ],
  ];

  for (const [rx, label] of checks) {
    if (rx.test(text)) {
      findings.push(`${rel}: ${label}`);
    }
  }

  if (/supabaseAdmin/i.test(text) && !rel.startsWith(`api${path.sep}`)) {
    findings.push(`${rel}: admin Supabase client referenced outside api/`);
  }
}

const migrations = files.filter(
  (file) =>
    file.includes(
      `${path.sep}supabase${path.sep}migrations${path.sep}`
    ) && file.endsWith(".sql")
);

for (const file of migrations) {
  let text;

  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    findings.push(
      `${path.relative(root, file)}: unable to read migration`
    );
    continue;
  }

  const lower = text.toLowerCase();
  const rel = path.relative(root, file);

  if (
    /\bsecurity\s+definer\b/.test(lower) &&
    !/set\s+search_path\s*=\s*public/i.test(text)
  ) {
    findings.push(
      `${rel}: SECURITY DEFINER without explicit search_path`
    );
  }

  if (
    /create\s+policy/i.test(lower) &&
    !/enable\s+row\s+level\s+security/i.test(lower)
  ) {
    findings.push(
      `${rel}: policy exists; verify table RLS is enabled`
    );
  }

  if (
    /grant\s+execute\s+on\s+function/i.test(lower) &&
    /\bsecurity\s+definer\b/.test(lower) &&
    !/revoke\s+all\s+on\s+function/i.test(lower)
  ) {
    findings.push(
      `${rel}: SECURITY DEFINER function should have explicit PUBLIC/anon/authenticated grants reviewed`
    );
  }
}

const packagePath = path.join(root, "package.json");

if (!fs.existsSync(packagePath)) {
  findings.push("package.json: file missing");
} else {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(packagePath, "utf8")
    );

    if (!packageJson.scripts?.["check:e2e"]) {
      findings.push("package.json: check:e2e script missing");
    }
  } catch (error) {
    findings.push(`package.json: invalid JSON (${error.message})`);
  }
}

console.log("Security audit scan complete.");

if (findings.length) {
  console.log(
    "\nREVIEW FINDINGS (not automatically vulnerabilities):"
  );

  for (const finding of findings) {
    console.log(`- ${finding}`);
  }

  console.log(
    `\n${findings.length} item(s) require manual review.`
  );
} else {
  console.log("No static review markers found.");
}

console.log(
  "\nThis scanner intentionally does not claim RLS/Storage/provider security is proven; those require live Supabase tests."
);
