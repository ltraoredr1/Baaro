import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };
const exists = (p) => fs.existsSync(path.join(root, p));

for (const file of ["src/app/App.jsx", "src/app/tabs.jsx", "vite.config.js"]) {
  if (!exists(file)) fail(`Missing performance-critical file: ${file}`);
}

if (!failed) {
  const tabs = fs.readFileSync(path.join(root, "src/app/tabs.jsx"), "utf8");
  for (const token of ["lazyRetry", "features/feed", "features/videos", "features/messaging"]) {
    if (!tabs.includes(token)) fail(`Expected lazy-loading marker missing in tabs.jsx: ${token}`);
  }
  // Le service worker actif (/sw.js) est généré par vite-plugin-pwa ; public/service-worker.js est LEGACY.
  const viteConfig = fs.readFileSync(path.join(root, "vite.config.js"), "utf8");
  if (!viteConfig.includes("runtimeCaching") || !viteConfig.includes("maxEntries")) {
    fail("Service worker cache bound missing (runtimeCaching with maxEntries in vite.config.js)");
  }
}

if (failed) process.exit(1);
console.log("BAARO performance foundation checks: OK");
