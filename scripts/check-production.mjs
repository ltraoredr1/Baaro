import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const required=[
  "package.json","vite.config.js","capacitor.config.json",
  "docs-BAARO-v19-SECURITY.md","scripts/security-audit-scan.mjs"
];
let bad=0;
for(const f of required){
  if(!fs.existsSync(path.join(root,f))){console.error(`MISSING ${f}`);bad++;}
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
for(const s of ["build","check:lock","check:e2e","audit:security","check:payout"]){
  if(!pkg.scripts?.[s]){console.error(`MISSING npm script ${s}`);bad++;}
}
const envExamples=[".env.example",".env.production.example"];
for(const f of envExamples){
  if(!fs.existsSync(path.join(root,f))) {
    console.error(`MISSING ${f}`);
    bad++;
  }
}
if(bad){process.exit(1);}
console.log("Production readiness configuration: OK");
console.log("Live deployment, secrets, DNS, provider credentials and CI runners still require environment validation.");
