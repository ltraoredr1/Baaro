import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/features/future/FutureCorePanel.jsx",
  "src/lib/futureCore.js",
  "public/brand/baaro-logo.png",
  "worker/Dockerfile"
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Future Core missing:", missing.join(", "));
  process.exit(1);
}

// Les migrations SQL sont volontairement absentes : ce script ne vérifie
// ni le schéma Supabase ni les RPC. Ne jamais recréer le fichier SQL ici.
console.warn("NOT VERIFIED: schéma Future Core Supabase non inspectable (migrations volontairement absentes).");
console.log("BAARO Future Core: fichiers applicatifs présents.");
