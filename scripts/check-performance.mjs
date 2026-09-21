import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "src/app/App.jsx",
  "src/app/tabs.jsx",
  "vite.config.js",
  "public/service-worker.js",
];
let failed = false;
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing performance-critical file: ${file}`);
    failed = true;
  }
}

if (!failed) {
  const tabs = fs.readFileSync(path.join(root, "src/app/tabs.jsx"), "utf8");
  const lazyMarkers = [
    'lazy(() =>',
    'features/feed',
    'features/videos',
    'features/messaging',
  ];
  for (const token of lazyMarkers) {
    if (!tabs.includes(token)) {
      console.error(`Expected lazy-loading marker missing in tabs.jsx: ${token}`);
      failed = true;
    }
  }

  const sw = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
  if (!sw.includes("MAX_RUNTIME_ENTRIES")) {
    console.error("Service worker cache bound missing");
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("BAARO performance foundation checks: OK");
