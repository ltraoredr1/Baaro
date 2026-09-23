import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || process.cwd();

const required = [
  "supabase/migrations/017_discovery_video.sql",
  "supabase/migrations/018_production_hardening.sql",
  "supabase/migrations/019_social_production_hardening.sql",
  "src/components/DiscoverHub.jsx",
  "src/components/NotificationCenter.jsx",
  "src/lib/feedEvents.js",
  "src/lib/reportContent.js",
];

let failed = false;

function isFile(rel) {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

// Required files
for (const rel of required) {
  if (!isFile(rel)) {
    fail(`MISSING ${rel}`);
  }
}

// API file-count guard
const api = path.join(root, "api");

if (fs.existsSync(api)) {
  const files = fs
    .readdirSync(api, { withFileTypes: true })
    .filter((entry) => entry.isFile());

  if (files.length > 12) {
    fail(`API_LIMIT ${files.length} files (maximum 12)`);
  } else {
    console.log(`API_LIMIT OK: ${files.length}/12 files`);
  }
} else {
  fail("MISSING api directory");
}

// Migration prefix guard
const migrations = path.join(root, "supabase/migrations");

if (fs.existsSync(migrations)) {
  const names = fs
    .readdirSync(migrations)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  const seen = new Map();
  const duplicates = [];

  for (const name of names) {
    const match = name.match(/^(\d+)[_-]/);

    if (!match) {
      continue;
    }

    const prefix = match[1];

    if (seen.has(prefix)) {
      duplicates.push(`${prefix}: ${seen.get(prefix)}, ${name}`);
    } else {
      seen.set(prefix, name);
    }
  }

  if (duplicates.length) {
    console.warn(
      "WARNING duplicate migration prefixes:",
      duplicates.join("; ")
    );
  } else {
    console.log("Migration prefix check: OK");
  }
} else {
  fail("MISSING supabase/migrations directory");
}

if (failed) {
  process.exit(1);
}

console.log("BAARO upgrade structure validation: PASS");
