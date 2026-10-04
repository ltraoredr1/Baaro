import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const exists = (p) => fs.existsSync(path.join(root, p));

for (const file of ["src/app/App.jsx", "src/app/tabs.jsx", "vite.config.js", "public/service-worker.js"]) {
  if (!exists(file)) fail(`Missing performance-critical file: ${file}`);
}

if (!failed) {
  const tabs = fs.readFileSync(path.join(root, "src/app/tabs.jsx"), "utf8");
  for (const token of ["lazyRetry", "features/feed", "features/videos", "features/messaging"]) {
    if (!tabs.includes(token)) fail(`Expected lazy-loading marker missing in tabs.jsx: ${token}`);
  }
  const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
  if (!sw.includes("MAX_RUNTIME_ENTRIES")) fail("Service worker cache bound missing");
}

if (failed) process.exit(1);
console.log("BAARO performance foundation checks: OK");
