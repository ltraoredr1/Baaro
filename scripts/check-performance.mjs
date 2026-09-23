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

function existsAsFile(relativePath) {
  const fullPath = path.join(root, relativePath);

  try {
    return fs.statSync(fullPath).isFile();
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed = true;
}

for (const file of files) {
  if (!existsAsFile(file)) {
    fail(`Missing performance-critical file: ${file}`);
  }
}

if (!failed) {
  const tabsPath = path.join(root, "src/app/tabs.jsx");
  const tabs = fs.readFileSync(tabsPath, "utf8");

  const lazyMarkers = [
    "lazy(() =>",
    "features/feed",
    "features/videos",
    "features/messaging",
  ];

  for (const token of lazyMarkers) {
    if (!tabs.includes(token)) {
      fail(`Expected lazy-loading marker missing in tabs.jsx: ${token}`);
    }
  }

  const serviceWorkerPath = path.join(root, "public/service-worker.js");
  const sw = fs.readFileSync(serviceWorkerPath, "utf8");

  if (!sw.includes("MAX_RUNTIME_ENTRIES")) {
    fail("Service worker cache bound missing");
  }
}

if (failed) {
  process.exit(1);
}

console.log("BAARO performance foundation checks: OK");
